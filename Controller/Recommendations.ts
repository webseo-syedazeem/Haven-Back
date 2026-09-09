import { remember, CacheTTL, userCacheKey } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const ARRAY_FIELDS = ["contains", "animals", "instruments", "sound_sources"] as const
const ARRAY_OVERLAP_CAP = 6
const DETAIL_MATCH_BONUS = 2
const MODE_MATCH_BONUS = 3
const GOAL_KEYWORD_BONUS = 1
const DEFAULT_ALTERNATIVES_COUNT = 4
const MAX_ALTERNATIVES_COUNT = 20
const RECOMMENDED_NOW_LIMIT = 10

// Heuristic mapping from free-text onboarding goals to soundscape mode, pending a
// fixed goal taxonomy. Only used as a small scoring nudge, never a hard filter.
const MODE_GOAL_KEYWORDS: Record<string, string[]> = {
    sleep: ["sleep"],
    relax: ["relax", "calm", "stress", "anxiety", "unwind"],
    focus: ["focus", "concentrat", "productiv", "study", "work"],
}

type SoundscapeRow = Record<string, unknown> & {
    id: string
    mode?: string | null
    detail_level?: string | null
    duration_seconds?: number | null
    sort_score?: number | null
    title?: string | null
}

type UserSignals = {
    hasSignals: boolean
    preferredSounds: Set<string>
    preferredAnimals: Set<string>
    preferredInstruments: Set<string>
    excludedSounds: string[]
    detailPreference: string | null
    typicalMinutes: number | null
    startingMode: string | null
    goals: string[]
}

const EMPTY_SIGNALS: UserSignals = {
    hasSignals: false,
    preferredSounds: new Set(),
    preferredAnimals: new Set(),
    preferredInstruments: new Set(),
    excludedSounds: [],
    detailPreference: null,
    typicalMinutes: null,
    startingMode: null,
    goals: [],
}

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

const toLowerStringArray = (value: unknown): string[] => {
    return [...toLowerStringSet(value)]
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

const extractMinutes = (value: string): number | null => {
    const match = value.match(/\d+/)
    return match ? Number(match[0]) : null
}

const getAppUserId = async (req: Request, cacheState?: { cacheable: boolean }): Promise<string | number | null> => {
    if (!req.user) {
        return null
    }

    const { data: userProfile, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", req.user.id)
        .maybeSingle()

    // Preserve the existing guest fallback, but never cache a failed profile lookup.
    if (error && cacheState) cacheState.cacheable = false
    return userProfile ? (userProfile.id as string | number) : null
}

const getUserSignals = async (appUserId: string | number | null): Promise<UserSignals> => {
    if (appUserId === null) {
        return EMPTY_SIGNALS
    }

    const [preferencesResult, onboardingResult] = await Promise.all([
        supabaseAdmin
            .from("user_sound_preferences")
            .select("*")
            .eq("user_id", appUserId)
            .maybeSingle(),
        supabaseAdmin
            .from("user_onboarding")
            .select("goals, starting_mode")
            .eq("user_id", appUserId)
            .maybeSingle(),
    ])

    if (preferencesResult.error) {
        throw preferencesResult.error
    }
    if (onboardingResult.error) {
        throw onboardingResult.error
    }

    const preferences = preferencesResult.data
    const onboarding = onboardingResult.data

    if (!preferences && !onboarding) {
        return EMPTY_SIGNALS
    }

    const typicalDuration = preferences?.typical_duration
    const typicalMinutes = typeof typicalDuration === "string" ? extractMinutes(typicalDuration) : null

    return {
        hasSignals: true,
        preferredSounds: toLowerStringSet(preferences?.preferred_sounds),
        preferredAnimals: toLowerStringSet(preferences?.preferred_animals),
        preferredInstruments: toLowerStringSet(preferences?.preferred_instruments),
        excludedSounds: toLowerStringArray(preferences?.excluded_sounds),
        detailPreference: typeof preferences?.detail_preference === "string" ? preferences.detail_preference : null,
        typicalMinutes,
        startingMode: typeof onboarding?.starting_mode === "string" ? onboarding.starting_mode : null,
        goals: Array.isArray(onboarding?.goals)
            ? onboarding.goals.filter((goal): goal is string => typeof goal === "string")
            : [],
    }
}

const isHardExcluded = (soundscape: SoundscapeRow, excludedSounds: string[]): boolean => {
    if (excludedSounds.length === 0) {
        return false
    }

    const soundscapeValues = ARRAY_FIELDS.flatMap((field) => toLowerStringArray(soundscape[field]))

    return excludedSounds.some((excluded) =>
        soundscapeValues.some((value) => value.includes(excluded) || excluded.includes(value))
    )
}

const scoreSoundscape = (soundscape: SoundscapeRow, signals: UserSignals): number => {
    let score = 0

    const soundscapeSounds = new Set([
        ...toLowerStringArray(soundscape.contains),
        ...toLowerStringArray(soundscape.sound_sources),
    ])
    const soundscapeAnimals = toLowerStringSet(soundscape.animals)
    const soundscapeInstruments = toLowerStringSet(soundscape.instruments)

    const overlap =
        countSharedElements(signals.preferredSounds, soundscapeSounds) +
        countSharedElements(signals.preferredAnimals, soundscapeAnimals) +
        countSharedElements(signals.preferredInstruments, soundscapeInstruments)
    score += Math.min(overlap, ARRAY_OVERLAP_CAP)

    if (signals.detailPreference && signals.detailPreference === soundscape.detail_level) {
        score += DETAIL_MATCH_BONUS
    }

    if (signals.typicalMinutes !== null && typeof soundscape.duration_seconds === "number") {
        const soundscapeMinutes = soundscape.duration_seconds / 60
        const diff = Math.abs(signals.typicalMinutes - soundscapeMinutes)
        if (diff <= 5) {
            score += 2
        } else if (diff <= 15) {
            score += 1
        }
    }

    const mode = typeof soundscape.mode === "string" ? soundscape.mode : null
    if (mode) {
        if (signals.startingMode && signals.startingMode === mode) {
            score += MODE_MATCH_BONUS
        }

        const keywords = MODE_GOAL_KEYWORDS[mode] || []
        if (signals.goals.some((goal) => keywords.some((keyword) => goal.toLowerCase().includes(keyword)))) {
            score += GOAL_KEYWORD_BONUS
        }
    }

    return score
}

const sortScoreOf = (soundscape: SoundscapeRow) =>
    typeof soundscape.sort_score === "number" ? soundscape.sort_score : 0

const titleOf = (soundscape: SoundscapeRow) =>
    typeof soundscape.title === "string" ? soundscape.title : ""

// Shared by /api/recommendations and /api/home/recommended so both surfaces rank
// soundscapes identically. Loads the full live catalogue into memory and scores it
// in application code, matching the existing GetSimilarSoundscapes/GetPopularCollections
// pattern in Controller/Soundscape.ts rather than a new Postgres function.
export const getRankedLiveSoundscapes = async (req: Request, cacheState?: { cacheable: boolean }): Promise<SoundscapeRow[]> => {
    const appUserId = await getAppUserId(req, cacheState)
    const signals = await getUserSignals(appUserId)

    const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
        .from("soundscapes")
        .select("*")
        .eq("status", "live")

    if (soundscapesError) {
        throw soundscapesError
    }

    const rows = ((soundscapes || []) as SoundscapeRow[]).filter(
        (soundscape) => !isHardExcluded(soundscape, signals.excludedSounds)
    )

    if (!signals.hasSignals) {
        const { data: playHistory, error: playHistoryError } = await supabaseAdmin
            .from("user_play_history")
            .select("soundscape_id")

        if (playHistoryError) {
            throw playHistoryError
        }

        const playCounts = new Map<string, number>()
        for (const row of playHistory || []) {
            const id = String(row.soundscape_id)
            playCounts.set(id, (playCounts.get(id) || 0) + 1)
        }

        return rows.sort((a, b) => {
            const playDiff = (playCounts.get(String(b.id)) || 0) - (playCounts.get(String(a.id)) || 0)
            if (playDiff !== 0) {
                return playDiff
            }
            const sortScoreDiff = sortScoreOf(b) - sortScoreOf(a)
            if (sortScoreDiff !== 0) {
                return sortScoreDiff
            }
            return titleOf(a).localeCompare(titleOf(b))
        })
    }

    const scored = rows.map((soundscape) => ({ soundscape, score: scoreSoundscape(soundscape, signals) }))

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score
        }
        const sortScoreDiff = sortScoreOf(b.soundscape) - sortScoreOf(a.soundscape)
        if (sortScoreDiff !== 0) {
            return sortScoreDiff
        }
        return titleOf(a.soundscape).localeCompare(titleOf(b.soundscape))
    })

    return scored.map(({ soundscape }) => soundscape)
}

const parseAlternativesCount = (value: unknown): { count: number; error?: string } => {
    if (value === undefined) {
        return { count: DEFAULT_ALTERNATIVES_COUNT }
    }

    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return { count: DEFAULT_ALTERNATIVES_COUNT, error: "count must be a non-negative integer" }
    }

    const parsed = Number(value)
    if (parsed > MAX_ALTERNATIVES_COUNT) {
        return { count: DEFAULT_ALTERNATIVES_COUNT, error: `count must be at most ${MAX_ALTERNATIVES_COUNT}` }
    }

    return { count: parsed }
}

export const GetRecommendations = async (req: Request, res: Response) => {
    const parsedCount = parseAlternativesCount(req.query.count)

    if (parsedCount.error) {
        return res.status(400).json({ success: false, error: parsedCount.error })
    }

    try {
        const cacheState = { cacheable: true }
        const key = userCacheKey(req.user?.id, parsedCount.count === DEFAULT_ALTERNATIVES_COUNT
            ? "recommendations"
            : `recommendations:count:${parsedCount.count}`)
        const data = await remember(key, CacheTTL.USER, async () => {
            const ranked = await getRankedLiveSoundscapes(req, cacheState)

            return {
                best_match: ranked[0] || null,
                alternatives: ranked.slice(1, 1 + parsedCount.count),
            }
        }, () => cacheState.cacheable)

        return res.status(200).json({ success: true, data })
    } catch (err) {
        console.error("Error getting recommendations:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetRecommendedNow = async (req: Request, res: Response) => {
    try {
        const cacheState = { cacheable: true }
        const data = await remember(userCacheKey(req.user?.id, "home-recommended"), CacheTTL.USER, async () => {
            const ranked = await getRankedLiveSoundscapes(req, cacheState)

            return { soundscapes: ranked.slice(0, RECOMMENDED_NOW_LIMIT) }
        }, () => cacheState.cacheable)

        return res.status(200).json({ success: true, data })
    } catch (err) {
        console.error("Error getting recommended now:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
