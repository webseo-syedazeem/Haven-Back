import { remember, CacheTTL, CacheReadError, libraryCacheKey, nextSequence } from "../Utils/CacheHelper.ts"
import { selectPreviewCombination } from "../Utils/PreviewRotation.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const SOUNDSCAPE_MODES = ["sleep", "relax", "focus"] as const
const LIBRARY_SORTS = [
    "recommended",
    "most_played",
    "most_saved",
    "recently_added",
    "a_z",
    "shortest",
    "longest",
    "lowest_intensity",
    "highest_detail",
] as const

type LibrarySort = (typeof LIBRARY_SORTS)[number]

type SoundscapeMode = (typeof SOUNDSCAPE_MODES)[number]

type SoundscapeRecord = Record<string, unknown> & {
    id: string
    mode: unknown
    subcategory: unknown
}

type GroupedBySubcategory = Record<string, SoundscapeRecord[]>
type GroupedSoundscapes = Record<SoundscapeMode, GroupedBySubcategory>

type CollectionMembership = {
    soundscape_id: unknown
    sort_order: unknown
}

const isSoundscapeMode = (value: unknown): value is SoundscapeMode => {
    return SOUNDSCAPE_MODES.includes(value as SoundscapeMode)
}

const createEmptyModeGroups = (): GroupedSoundscapes => ({
    sleep: {},
    relax: {},
    focus: {},
})

const getSubcategory = (soundscape: SoundscapeRecord) => {
    const subcategory = typeof soundscape.subcategory === "string"
        ? soundscape.subcategory.trim()
        : ""

    return subcategory || "uncategorized"
}

const groupBySubcategory = (soundscapes: SoundscapeRecord[]) => {
    const grouped: GroupedBySubcategory = {}

    for (const soundscape of soundscapes) {
        const subcategory = getSubcategory(soundscape)

        if (!grouped[subcategory]) {
            grouped[subcategory] = []
        }

        grouped[subcategory].push(soundscape)
    }

    return grouped
}

const groupByModeAndSubcategory = (soundscapes: SoundscapeRecord[]) => {
    const grouped = createEmptyModeGroups()

    for (const soundscape of soundscapes) {
        if (!isSoundscapeMode(soundscape.mode)) {
            continue
        }

        const subcategory = getSubcategory(soundscape)

        if (!grouped[soundscape.mode][subcategory]) {
            grouped[soundscape.mode][subcategory] = []
        }

        grouped[soundscape.mode][subcategory].push(soundscape)
    }

    return grouped
}

const parseCommaSeparatedFilter = (value: unknown): string[] | null => {
    if (value === undefined || value === null) {
        return null
    }

    const rawValues = Array.isArray(value) ? value : [value]
    const parsedValues = rawValues
        .filter((item): item is string => typeof item === "string")
        .flatMap((item) => item.split(","))
        .map((item) => item.trim())
        .filter((item) => item.length > 0)

    const uniqueValues = [...new Set(parsedValues)]
    return uniqueValues.length > 0 ? uniqueValues : null
}

const parseOptionalDuration = (
    value: unknown,
    parameterName: "min_duration" | "max_duration"
): { value: number | null; error?: string } => {
    if (value === undefined || value === null) {
        return { value: null }
    }

    if (typeof value !== "string") {
        return { value: null, error: parameterName + " must be a non-negative integer" }
    }

    const normalizedValue = value.trim()

    if (!/^\d+$/.test(normalizedValue)) {
        return { value: null, error: parameterName + " must be a non-negative integer" }
    }

    const parsedValue = Number(normalizedValue)

    if (!Number.isSafeInteger(parsedValue) || parsedValue > 2_147_483_647) {
        return { value: null, error: parameterName + " must be a non-negative integer" }
    }

    return { value: parsedValue }
}

const isLibrarySort = (value: string): value is LibrarySort => {
    return LIBRARY_SORTS.includes(value as LibrarySort)
}

const sanitizeSearchQuery = (query: string) => {
    return query
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
}

const SIMILARITY_ARRAY_FIELDS = ["contains", "animals", "instruments", "sound_sources"] as const
const SIMILARITY_ARRAY_BONUS_CAP = 5

const toLowerStringSet = (value: unknown): Set<string> => {
    if (!Array.isArray(value)) {
        return new Set()
    }

    return new Set(
        value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
    )
}

const countSharedElements = (a: Set<string>, b: Set<string>) => {
    let shared = 0
    for (const value of a) {
        if (b.has(value)) {
            shared += 1
        }
    }
    return shared
}

export const GetLibrary = async (req: Request, res: Response) => {
    const modes = parseCommaSeparatedFilter(req.query.modes)
    const environments = parseCommaSeparatedFilter(req.query.environments)
    const contains = parseCommaSeparatedFilter(req.query.contains)
    const clientAvoids = parseCommaSeparatedFilter(req.query.avoids)
    const animals = parseCommaSeparatedFilter(req.query.animals)
    const instruments = parseCommaSeparatedFilter(req.query.instruments)
    const detailLevels = parseCommaSeparatedFilter(req.query.detail_levels)
    const minDuration = parseOptionalDuration(req.query.min_duration, "min_duration")
    const maxDuration = parseOptionalDuration(req.query.max_duration, "max_duration")

    if (minDuration.error) {
        return res.status(400).json({ success: false, error: minDuration.error })
    }

    if (maxDuration.error) {
        return res.status(400).json({ success: false, error: maxDuration.error })
    }

    const rawSort = req.query.sort
    const sort = rawSort === undefined
        ? "recommended"
        : typeof rawSort === "string"
            ? rawSort.trim()
            : ""

    if (!isLibrarySort(sort)) {
        return res.status(400).json({
            success: false,
            error: "sort must be one of " + LIBRARY_SORTS.join(", "),
        })
    }

    // Parse pagination parameters
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined
    const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 200)) {
        return res.status(400).json({ success: false, error: "limit must be between 1 and 200" })
    }

    if (isNaN(offset) || offset < 0) {
        return res.status(400).json({ success: false, error: "offset must be 0 or greater" })
    }

    try {
        let avoids = clientAvoids

        if (req.user) {
            const { data: userProfile, error: userProfileError } = await supabaseAdmin
                .from("users")
                .select("id")
                .eq("auth_user_id", req.user.id)
                .maybeSingle()

            if (userProfileError) {
                console.error("Get library user profile error:", userProfileError)
                return res.status(500).json({ success: false, error: "Failed to get library" })
            }

            if (userProfile) {
                const { data: preferences, error: preferencesError } = await supabaseAdmin
                    .from("user_sound_preferences")
                    .select("excluded_sounds")
                    .eq("user_id", userProfile.id)
                    .maybeSingle()

                if (preferencesError) {
                    console.error("Get library sound preferences error:", preferencesError)
                    return res.status(500).json({ success: false, error: "Failed to get library" })
                }

                const excludedSounds = Array.isArray(preferences?.excluded_sounds)
                    ? preferences.excluded_sounds.filter((value): value is string => typeof value === "string")
                    : []

                if (excludedSounds.length > 0) {
                    const merged = new Set([...(avoids || []), ...excludedSounds])
                    avoids = [...merged]
                }
            }
        }

        const appliedFilters = {
            modes,
            environments,
            contains,
            avoids,
            animals,
            instruments,
            detail_levels: detailLevels,
            min_duration: minDuration.value,
            max_duration: maxDuration.value,
            sort,
        }

        // Cache catalogue data only; echo this request's filter order/spelling below.
        const cachedData = await remember(libraryCacheKey(appliedFilters), CacheTTL.LIBRARY, async () => {
            const { data: soundscapes, error: soundscapesError } = await supabaseAdmin.rpc(
                "filter_soundscapes",
                {
                    p_modes: modes,
                    p_environments: environments,
                    p_contains: contains,
                    p_avoids: avoids,
                    p_animals: animals,
                    p_instruments: instruments,
                    p_detail_levels: detailLevels,
                    p_min_duration_seconds: minDuration.value,
                    p_max_duration_seconds: maxDuration.value,
                    p_sort: sort,
                }
            )

            if (soundscapesError) {
                console.error("Get library error:", soundscapesError)
                throw new CacheReadError(500, "Failed to get library")
            }

            const rows = Array.isArray(soundscapes) ? soundscapes : []
            return { soundscapes: rows, result_count: rows.length }
        })

        // Paginate the cached, fully-ordered result set in memory (audit B-SCALE-1).
        //
        // This is deliberate, not an oversight. The live catalogue is ~100 rows,
        // so the whole filtered set is cheap to materialise once, cache for the
        // window, and slice per page. Doing it this way keeps a single cache entry
        // per filter combination and a stable order across pages (so pages never
        // duplicate or drop items). Pushing LIMIT/OFFSET into the `filter_soundscapes`
        // RPC would need a DB migration, a separate COUNT for `result_count`, and
        // per-page cache keys — more moving parts and a weaker ordering guarantee,
        // for no benefit at this size. Revisit (move paging into the RPC) only if
        // the catalogue grows into the thousands.
        const totalCount = cachedData.result_count
        const allSoundscapes = cachedData.soundscapes
        const paginatedSoundscapes = limit !== undefined
            ? allSoundscapes.slice(offset, offset + limit)
            : allSoundscapes

        return res.status(200).json({
            success: true,
            data: { 
                soundscapes: paginatedSoundscapes, 
                result_count: totalCount,
                applied_filters: appliedFilters,
                pagination: {
                    offset,
                    limit: limit !== undefined ? limit : totalCount,
                    has_more: offset + (limit || totalCount) < totalCount
                }
            },
        })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting library:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAllSoundscapes = async (_req: Request, res: Response) => {
    try {
        const data = await remember("soundscapes:all", CacheTTL.CONTENT, async () => {
            const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
                .from("soundscapes")
                .select("*")
                .eq("status", "live")
                .order("sort_score", { ascending: false })
                .order("title", { ascending: true })

            if (soundscapesError) {
                console.error("Get soundscapes error:", soundscapesError)
                throw new CacheReadError(500, "Failed to get soundscapes")
            }

            const groupedSoundscapes = groupByModeAndSubcategory(
                (soundscapes || []) as SoundscapeRecord[]
            )

            return { soundscapes: groupedSoundscapes }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

// Live soundscapes for one mode in the catalogue's ranked order (sort_score desc, then
// title). Shared by GetSoundscapesByMode (which groups the result by subcategory) and
// GetSoundscapesModePreview (which rotates combinations from the ranked pool), so both
// surfaces always agree on what "the mode's soundscapes, in order" means. Throws CacheReadError
// on a database failure so callers inside remember() never cache a partial result.
const fetchRankedLiveSoundscapesByMode = async (mode: SoundscapeMode): Promise<SoundscapeRecord[]> => {
    const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
        .from("soundscapes")
        .select("*")
        .eq("status", "live")
        .eq("mode", mode)
        .order("sort_score", { ascending: false })
        .order("title", { ascending: true })

    if (soundscapesError) {
        console.error("Get soundscapes by mode error:", soundscapesError)
        throw new CacheReadError(500, "Failed to get soundscapes")
    }

    return (soundscapes || []) as SoundscapeRecord[]
}

export const GetSoundscapesByMode = async (req: Request, res: Response) => {
    const mode = String(req.params.mode || "").trim().toLowerCase()

    if (!isSoundscapeMode(mode)) {
        return res.status(400).json({
            success: false,
            error: "mode must be one of sleep, relax, or focus",
        })
    }

    try {
        const data = await remember(`soundscapes:mode:${mode}`, CacheTTL.CONTENT, async () => {
            const groupedSoundscapes = groupBySubcategory(await fetchRankedLiveSoundscapesByMode(mode))

            return {
                mode,
                soundscapes: groupedSoundscapes,
            }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting soundscapes by mode:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

const DEFAULT_PREVIEW_COUNT = 3
const MAX_PREVIEW_COUNT = 10
const previewPoolRequests = new Map<SoundscapeMode, Promise<SoundscapeRecord[]>>()

const parsePreviewCount = (value: unknown): { count: number; error?: string } => {
    if (value === undefined) {
        return { count: DEFAULT_PREVIEW_COUNT }
    }

    if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1) {
        return { count: DEFAULT_PREVIEW_COUNT, error: "count must be a positive integer" }
    }

    const parsed = Number(value)
    if (parsed > MAX_PREVIEW_COUNT) {
        return { count: DEFAULT_PREVIEW_COUNT, error: `count must be at most ${MAX_PREVIEW_COUNT}` }
    }

    return { count: parsed }
}

const getPreviewPool = (mode: SoundscapeMode): Promise<SoundscapeRecord[]> => {
    const pending = previewPoolRequests.get(mode)
    if (pending) return pending

    const request = remember(
        `soundscapes:mode:${mode}:preview:pool`,
        CacheTTL.CONTENT,
        () => fetchRankedLiveSoundscapesByMode(mode),
    ).finally(() => {
        if (previewPoolRequests.get(mode) === request) previewPoolRequests.delete(mode)
    })

    previewPoolRequests.set(mode, request)
    return request
}

// Flat rotating list for the onboarding preview screen. The catalogue pool stays
// cached, while each request receives its own atomic sequence slot and therefore
// a different combination until all possible combinations have been served.
export const GetSoundscapesModePreview = async (req: Request, res: Response) => {
    const mode = String(req.params.mode || "").trim().toLowerCase()

    if (!isSoundscapeMode(mode)) {
        return res.status(400).json({
            success: false,
            error: "mode must be one of sleep, relax, or focus",
        })
    }

    const parsedCount = parsePreviewCount(req.query.count)
    if (parsedCount.error) {
        return res.status(400).json({ success: false, error: parsedCount.error })
    }

    try {
        const pool = await getPreviewPool(mode)
        const sequence = await nextSequence(
            `rotation:soundscapes:mode:${mode}:preview:${parsedCount.count}`
        )
        const data = {
            mode,
            soundscapes: selectPreviewCombination(pool, parsedCount.count, sequence),
        }

        // The pool is cached server-side, but each response is deliberately unique.
        // Prevent browsers and intermediary proxies from freezing one rotation slot.
        res.set("Cache-Control", "no-store, max-age=0")
        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting soundscapes mode preview:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneSoundscape = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const data = await remember(`soundscape:${soundscapeId.toLowerCase()}:details`, CacheTTL.CONTENT, async () => {
            const { data: soundscape, error: soundscapeError } = await supabaseAdmin
                .from("soundscapes")
                .select("*")
                .eq("id", soundscapeId)
                .eq("status", "live")
                .maybeSingle()

            if (soundscapeError) {
                console.error("Get soundscape error:", soundscapeError)
                throw new CacheReadError(500, "Failed to get soundscape")
            }

            if (!soundscape) {
                throw new CacheReadError(404, "Soundscape not found")
            }

            return { soundscape }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SearchSoundscapes = async (req: Request, res: Response) => {
    const query = String(req.query.q || "").trim()

    if (!query) {
        return res.status(400).json({ success: false, error: "q is required" })
    }

    const sanitizedQuery = sanitizeSearchQuery(query)

    if (!sanitizedQuery) {
        return res.status(400).json({ success: false, error: "q is required" })
    }

    try {
        const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
            .rpc("search_soundscapes", { search_query: sanitizedQuery })

        if (soundscapesError) {
            console.error("Search soundscapes error:", soundscapesError)
            return res.status(500).json({ success: false, error: "Failed to search soundscapes" })
        }

        return res.status(200).json({
            success: true,
            data: { soundscapes: soundscapes || [] },
        })
    } catch (err) {
        console.error("Error searching soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetSearchSuggestions = async (req: Request, res: Response) => {
    const query = String(req.query.q || "").trim()

    if (!query) {
        return res.status(400).json({ success: false, error: "q is required" })
    }

    const sanitizedQuery = sanitizeSearchQuery(query)

    if (!sanitizedQuery) {
        return res.status(400).json({ success: false, error: "q is required" })
    }

    try {
        const { data: suggestions, error: suggestionsError } = await supabaseAdmin
            .from("soundscapes")
            .select("id, title, subcategory, mode, sort_score")
            .eq("status", "live")
            .or(`title.ilike.%${sanitizedQuery}%,subcategory.ilike.%${sanitizedQuery}%`)
            .order("sort_score", { ascending: false })
            .limit(8)

        if (suggestionsError) {
            console.error("Get search suggestions error:", suggestionsError)
            return res.status(500).json({ success: false, error: "Failed to get search suggestions" })
        }

        const rows = (suggestions || []).map(({ id, title, subcategory, mode }) => ({
            id,
            title,
            subcategory,
            mode,
        }))

        return res.status(200).json({
            success: true,
            data: { suggestions: rows },
        })
    } catch (err) {
        console.error("Error getting search suggestions:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetSimilarSoundscapes = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const data = await remember(`soundscape:${soundscapeId.toLowerCase()}:similar`, CacheTTL.CONTENT, async () => {
            const { data: source, error: sourceError } = await supabaseAdmin
                .from("soundscapes")
                .select("*")
                .eq("id", soundscapeId)
                .eq("status", "live")
                .maybeSingle()

            if (sourceError) {
                console.error("Get similar soundscapes source error:", sourceError)
                throw new CacheReadError(500, "Failed to get similar soundscapes")
            }

            if (!source) {
                throw new CacheReadError(404, "Soundscape not found")
            }

            const { data: candidates, error: candidatesError } = await supabaseAdmin
                .from("soundscapes")
                .select("*")
                .eq("status", "live")
                .eq("mode", source.mode as string)
                .neq("id", soundscapeId)

            if (candidatesError) {
                console.error("Get similar soundscapes candidates error:", candidatesError)
                throw new CacheReadError(500, "Failed to get similar soundscapes")
            }

            const sourceSubcategory = typeof source.subcategory === "string"
                ? source.subcategory.trim().toLowerCase()
                : ""
            const sourceArraySets = SIMILARITY_ARRAY_FIELDS.map((field) =>
                toLowerStringSet((source as Record<string, unknown>)[field])
            )

            const scored = ((candidates || []) as SoundscapeRecord[]).map((candidate) => {
                let score = 0

                const candidateSubcategory = typeof candidate.subcategory === "string"
                    ? candidate.subcategory.trim().toLowerCase()
                    : ""
                if (sourceSubcategory && candidateSubcategory === sourceSubcategory) {
                    score += 3
                }

                // Candidates are already filtered to the same mode as the source soundscape
                score += 1

                let sharedElements = 0
                SIMILARITY_ARRAY_FIELDS.forEach((field, index) => {
                    const candidateSet = toLowerStringSet((candidate as Record<string, unknown>)[field])
                    sharedElements += countSharedElements(sourceArraySets[index], candidateSet)
                })
                score += Math.min(sharedElements, SIMILARITY_ARRAY_BONUS_CAP)

                return { soundscape: candidate, score }
            })

            scored.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score
                }

                const aSortScore = typeof a.soundscape.sort_score === "number" ? a.soundscape.sort_score : 0
                const bSortScore = typeof b.soundscape.sort_score === "number" ? b.soundscape.sort_score : 0
                return bSortScore - aSortScore
            })

            const topMatches = scored.slice(0, 6).map(({ soundscape, score }) => ({
                ...soundscape,
                similarity_score: score,
            }))

            return { soundscapes: topMatches }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting similar soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetCollections = async (_req: Request, res: Response) => {
    try {
        const data = await remember("collections:all", CacheTTL.CONTENT, async () => {
            const { data: collections, error: collectionsError } = await supabaseAdmin
                .from("collections")
                .select("*")
                .eq("is_published", true)
                .order("sort_order", { ascending: true })

            if (collectionsError) {
                console.error("Get collections error:", collectionsError)
                throw new CacheReadError(500, "Failed to get collections")
            }

            return { collections: collections || [] }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting collections:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneCollection = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()

    try {
        const data = await remember(`collection:${collectionId.toLowerCase()}`, CacheTTL.CONTENT, async () => {
            const { data: collection, error: collectionError } = await supabaseAdmin
                .from("collections")
                .select("*")
                .eq("id", collectionId)
                .eq("is_published", true)
                .maybeSingle()

            if (collectionError) {
                console.error("Get collection error:", collectionError)
                throw new CacheReadError(500, "Failed to get collection")
            }

            if (!collection) {
                throw new CacheReadError(404, "Collection not found")
            }

            const { data: membershipRows, error: membershipError } = await supabaseAdmin
                .from("collection_soundscapes")
                .select("soundscape_id, sort_order")
                .eq("collection_id", collectionId)
                .order("sort_order", { ascending: true })

            if (membershipError) {
                console.error("Get collection soundscape memberships error:", membershipError)
                throw new CacheReadError(500, "Failed to get collection")
            }

            const memberships = (membershipRows || []) as CollectionMembership[]
            const soundscapeIds = memberships
                .map((membership) => String(membership.soundscape_id || "").trim())
                .filter((id): id is string => id.length > 0)

            let orderedSoundscapes: SoundscapeRecord[] = []

            if (soundscapeIds.length > 0) {
                const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
                    .from("soundscapes")
                    .select("*")
                    .eq("status", "live")
                    .in("id", soundscapeIds)

                if (soundscapesError) {
                    console.error("Get collection soundscapes error:", soundscapesError)
                    throw new CacheReadError(500, "Failed to get collection")
                }

                const soundscapeById = new Map(
                    ((soundscapes || []) as SoundscapeRecord[])
                        .map((soundscape) => [String(soundscape.id), soundscape])
                )

                orderedSoundscapes = soundscapeIds
                    .map((soundscapeId) => soundscapeById.get(soundscapeId))
                    .filter((soundscape): soundscape is SoundscapeRecord => Boolean(soundscape))
            }

            return {
                collection: {
                    ...collection,
                    soundscapes: orderedSoundscapes,
                },
            }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting collection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

const EXPLORE_GROUPS_ORDER = [
    "nature",
    "indoor",
    "travel",
    "animals",
    "instruments",
    "weather",
    "situation",
    "editorial",
] as const

// Published collections are discoverable even before editors classify them:
// unclassified rows fall back to Editorial. Only live-member metadata is exposed.
export const GetExploreGroups = async (_req: Request, res: Response) => {
    try {
        const data = await remember("explore:groups", CacheTTL.CONTENT, async () => {
            const { data: collections, error } = await supabaseAdmin
                .from("collections")
                .select("*")
                .eq("is_published", true)
                .order("sort_order", { ascending: true })
                .order("title", { ascending: true })

            if (error) {
                console.error("Get explore groups error:", error)
                throw new CacheReadError(500, "Failed to get explore groups")
            }

            const collectionRows = collections || []
            if (collectionRows.length === 0) {
                return { groups: [] }
            }

            const collectionIds = collectionRows.map((collection) => String(collection.id))
            const { data: memberships, error: membershipsError } = await supabaseAdmin
                .from("collection_soundscapes")
                .select("collection_id, soundscape_id")
                .in("collection_id", collectionIds)

            if (membershipsError) {
                console.error("Get explore memberships error:", membershipsError)
                throw new CacheReadError(500, "Failed to get explore groups")
            }

            const membershipRows = memberships || []
            const soundscapeIds = [
                ...new Set(membershipRows.map((membership) => String(membership.soundscape_id))),
            ]
            const liveModeBySoundscapeId = new Map<string, SoundscapeMode>()

            if (soundscapeIds.length > 0) {
                const { data: liveSoundscapes, error: soundscapesError } = await supabaseAdmin
                    .from("soundscapes")
                    .select("id, mode")
                    .eq("status", "live")
                    .in("id", soundscapeIds)

                if (soundscapesError) {
                    console.error("Get explore soundscapes error:", soundscapesError)
                    throw new CacheReadError(500, "Failed to get explore groups")
                }

                for (const soundscape of liveSoundscapes || []) {
                    if (isSoundscapeMode(soundscape.mode)) {
                        liveModeBySoundscapeId.set(String(soundscape.id), soundscape.mode)
                    }
                }
            }

            const liveMemberIdsByCollection = new Map<string, Set<string>>()
            const liveModesByCollection = new Map<string, Set<SoundscapeMode>>()

            for (const membership of membershipRows) {
                const soundscapeId = String(membership.soundscape_id)
                const mode = liveModeBySoundscapeId.get(soundscapeId)
                if (!mode) continue

                const collectionId = String(membership.collection_id)
                const memberIds = liveMemberIdsByCollection.get(collectionId) || new Set<string>()
                const modes = liveModesByCollection.get(collectionId) || new Set<SoundscapeMode>()
                memberIds.add(soundscapeId)
                modes.add(mode)
                liveMemberIdsByCollection.set(collectionId, memberIds)
                liveModesByCollection.set(collectionId, modes)
            }

            const grouped = new Map<string, Record<string, unknown>[]>()
            for (const collection of collectionRows) {
                const collectionId = String(collection.id)
                const liveMemberIds = liveMemberIdsByCollection.get(collectionId)
                if (!liveMemberIds?.size) continue

                const requestedGroup = String(
                    (collection as Record<string, unknown>).explore_group || ""
                )
                const group = EXPLORE_GROUPS_ORDER.includes(
                    requestedGroup as (typeof EXPLORE_GROUPS_ORDER)[number]
                )
                    ? requestedGroup
                    : "editorial"

                if (!grouped.has(group)) {
                    grouped.set(group, [])
                }
                grouped.get(group)!.push({
                    ...collection,
                    soundscape_count: liveMemberIds.size,
                    soundscape_modes: [...(liveModesByCollection.get(collectionId) || [])],
                })
            }

            const groups = EXPLORE_GROUPS_ORDER
                .filter((group) => grouped.has(group))
                .map((group) => ({ group, collections: grouped.get(group)! }))

            return { groups }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting explore groups:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

const POPULAR_COLLECTIONS_LIMIT = 10

export const GetPopularCollections = async (_req: Request, res: Response) => {
    try {
        const data = await remember("collections:popular", CacheTTL.CONTENT, async () => {
            const { data: collections, error: collectionsError } = await supabaseAdmin
                .from("collections")
                .select("*")
                .eq("is_published", true)

            if (collectionsError) {
                console.error("Get popular collections error:", collectionsError)
                throw new CacheReadError(500, "Failed to get popular collections")
            }

            const collectionRows = collections || []

            if (collectionRows.length === 0) {
                return { collections: [] }
            }

            const collectionIds = collectionRows.map((collection) => String(collection.id))

            const { data: memberships, error: membershipsError } = await supabaseAdmin
                .from("collection_soundscapes")
                .select("collection_id, soundscape_id")
                .in("collection_id", collectionIds)

            if (membershipsError) {
                console.error("Get popular collections memberships error:", membershipsError)
                throw new CacheReadError(500, "Failed to get popular collections")
            }

            const membershipRows = memberships || []
            const allSoundscapeIds = [...new Set(membershipRows.map((row) => String(row.soundscape_id)))]

            let liveIds = new Set<string>()
            const playCounts = new Map<string, number>()
            const favouriteCounts = new Map<string, number>()

            if (allSoundscapeIds.length > 0) {
                const [liveResult, playResult, favouriteResult] = await Promise.all([
                    supabaseAdmin
                        .from("soundscapes")
                        .select("id")
                        .eq("status", "live")
                        .in("id", allSoundscapeIds),
                    supabaseAdmin
                        .from("user_play_history")
                        .select("soundscape_id")
                        .in("soundscape_id", allSoundscapeIds),
                    supabaseAdmin
                        .from("user_favourites")
                        .select("soundscape_id")
                        .in("soundscape_id", allSoundscapeIds),
                ])

                const firstError = liveResult.error || playResult.error || favouriteResult.error
                if (firstError) {
                    console.error("Get popular collections signal error:", firstError)
                    throw new CacheReadError(500, "Failed to get popular collections")
                }

                liveIds = new Set((liveResult.data || []).map((row) => String(row.id)))

                for (const row of playResult.data || []) {
                    const id = String(row.soundscape_id)
                    playCounts.set(id, (playCounts.get(id) || 0) + 1)
                }

                for (const row of favouriteResult.data || []) {
                    const id = String(row.soundscape_id)
                    favouriteCounts.set(id, (favouriteCounts.get(id) || 0) + 1)
                }
            }

            const liveMemberIdsByCollection = new Map<string, string[]>()
            for (const row of membershipRows) {
                const soundscapeId = String(row.soundscape_id)
                if (!liveIds.has(soundscapeId)) {
                    continue
                }

                const collectionId = String(row.collection_id)
                if (!liveMemberIdsByCollection.has(collectionId)) {
                    liveMemberIdsByCollection.set(collectionId, [])
                }
                liveMemberIdsByCollection.get(collectionId)!.push(soundscapeId)
            }

            const collectionsWithScore = collectionRows.map((collection) => {
                const memberIds = liveMemberIdsByCollection.get(String(collection.id)) || []
                const popularityScore = memberIds.reduce(
                    (sum, soundscapeId) =>
                        sum + (playCounts.get(soundscapeId) || 0) + (favouriteCounts.get(soundscapeId) || 0),
                    0
                )

                return { ...collection, popularity_score: popularityScore }
            })

            collectionsWithScore.sort((a, b) => {
                if (b.popularity_score !== a.popularity_score) {
                    return b.popularity_score - a.popularity_score
                }

                const aSortOrder = typeof a.sort_order === "number" ? a.sort_order : 0
                const bSortOrder = typeof b.sort_order === "number" ? b.sort_order : 0
                return aSortOrder - bSortOrder
            })

            return { collections: collectionsWithScore.slice(0, POPULAR_COLLECTIONS_LIMIT) }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting popular collections:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
