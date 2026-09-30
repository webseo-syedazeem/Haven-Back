import { remember, CacheTTL, userCacheKey } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const ARRAY_FIELDS = ["contains", "animals", "instruments", "sound_sources"] as const
const ARRAY_OVERLAP_CAP = 6
const DETAIL_MATCH_BONUS = 2
const MODE_MATCH_BONUS = 3
const DEFAULT_ALTERNATIVES_COUNT = 4
const MAX_ALTERNATIVES_COUNT = 20
const RECOMMENDED_NOW_LIMIT = 10

const SOUNDSCAPE_MODES = ["sleep", "relax", "focus"] as const
type SoundscapeMode = (typeof SOUNDSCAPE_MODES)[number]

const isSoundscapeMode = (value: unknown): value is SoundscapeMode =>
    SOUNDSCAPE_MODES.includes(value as SoundscapeMode)

const MODE_AREA_MATCH_BONUS = 3
const CALMING_MOMENT_MATCH_BONUS = 2
const INTENSITY_EXACT_MATCH_BONUS = 2
const INTENSITY_CLOSE_MATCH_BONUS = 1
const DISTURBANCE_ATTRIBUTE_BONUS = 2
const MASKING_INTENSITY_THRESHOLD = 4
const CALMING_INTENSITY_THRESHOLD = 2

// ── mode_areas ("Where do you need it most?") — FOCUS/SLEEP ONLY ─────────────
// Softly boosts soundscapes whose subcategory/description copy contains a mapped
// keyword. Never a hard filter: an unmapped or unmatched area contributes no
// bonus, so results can never go empty because of this. Relax has no entry here
// because Relax does not collect mode_areas at all — the column stays '{}' for
// Relax users and this block is simply skipped for them.
//
// Only areas with a defensible catalogue correlate are mapped. The rest —
// Focus "At a desk", Sleep "After late work" — are stored and returned as-is
// but intentionally NOT ranked on: no existing soundscape metadata field
// corresponds to them, and inventing one is out of scope.
const MODE_AREA_SUBCATEGORY_KEYWORDS: Record<"focus" | "sleep", Record<string, string[]>> = {
    focus: {
        "studying": ["study"],
        "creative work": ["creative"],
        "on the move": ["travel", "commute"],
    },
    sleep: {
        "falling asleep": ["fall asleep", "falling asleep"],
        "during travel": ["travel"],
        "after waking": ["back to sleep", "go back to sleep"],
    },
}

// ── calming_moments ("When do you most need to feel calmer?") — RELAX ONLY ───
// Deliberately weaker than mode_areas above, and scored lower
// (CALMING_MOMENT_MATCH_BONUS 2 vs MODE_AREA_MATCH_BONUS 3), because the mapping
// is genuinely weaker: mode_areas values name an ACTIVITY the catalogue copy is
// literally written about ("designed_for: returning to sleep after waking"
// matches "back to sleep"), whereas calming_moments values name a CLOCK TIME,
// which that copy is not written about. Only two of the four options have any
// lexical correlate at all; "During the day" and "Throughout the day" are
// stored-only, since matching bare "day" would collide with "daytime",
// "everyday" and with "Throughout the day" itself.
//
// Honest caveat: coverage is thin. Checked 2026-09-19 against the live catalogue,
// of 9 relax soundscapes only 1 mentions "evening" and none mention "night", so
// "At night" currently boosts nothing. It degrades safely (no match, no bonus).
const CALMING_MOMENT_KEYWORDS: Record<string, string[]> = {
    "in the evenings": ["evening"],
    "at night": ["night"],
}

// Broadened the same way Database/fix_filter_soundscapes_environments.sql broadens
// environment matching: subcategory plus the free-text fields most likely to carry
// purpose/description copy.
const CONTEXT_TEXT_FIELDS = ["subcategory", "one_line_description", "designed_for", "best_use"] as const

// ── mode_breakers (Focus/Sleep) and relax_causes (Relax) ─────────────────────
// Both are "what disturbs you" multi-selects, so both re-rank through the SAME
// heuristic on the existing 1-5 `intensity` field — the only catalogue attribute
// either has a defensible read on (a noise complaint ~ prefer steady, masking,
// higher-intensity audio; a rumination complaint ~ prefer calmer, lower-intensity
// audio). Sharing one pair of sets is deliberate: "Overthinking" appears in both
// option lists, and it would be incoherent for the same answer to mean one thing
// under mode_breakers and another under relax_causes.
//
// Everything else in either list is stored and returned as-is but NOT ranked on,
// because no existing soundscape metadata maps to it without inventing a field:
//   mode_breakers  Phone distractions, Low energy, Getting started,
//                  Restlessness, An inconsistent routine, Waking in the night
//   relax_causes   Work, Social situations, News and social media, Finances, Other
// In practice "Overthinking" is the only relax_causes value that currently maps;
// no masking-shaped value appears in the Relax list today, but the masking set is
// applied to both so that stays true if the option list grows.
const MASKING_DISTURBANCES = new Set(["background noise", "outside noise"])
const CALMING_DISTURBANCES = new Set(["racing thoughts", "overthinking"])

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
    // user_sound_preferences (Profile > Sound Preferences / Sounds to Avoid) — untouched
    // by the onboarding redesign.
    preferredSounds: Set<string>
    preferredAnimals: Set<string>
    preferredInstruments: Set<string>
    excludedSounds: string[]
    detailPreference: string | null
    intensityPreference: number | null
    // user_onboarding
    mode: string | null // all modes — HARD filter
    modeBreakers: string[] // focus/sleep — intensity heuristic
    modeAreas: string[] // focus/sleep — subcategory keyword boost
    targetMinutes: number | null // focus/sleep — duration closeness
    relaxCauses: string[] // relax — intensity heuristic
    calmingMoments: string | null // relax — subcategory keyword boost
}

const EMPTY_SIGNALS: UserSignals = {
    hasSignals: false,
    preferredSounds: new Set(),
    preferredAnimals: new Set(),
    preferredInstruments: new Set(),
    excludedSounds: [],
    detailPreference: null,
    intensityPreference: null,
    mode: null,
    modeBreakers: [],
    modeAreas: [],
    targetMinutes: null,
    relaxCauses: [],
    calmingMoments: null,
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
        // main_goal is intentionally not selected because it has no defensible catalogue correlate.
        supabaseAdmin
            .from("user_onboarding")
            .select("mode, mode_breakers, mode_areas, target_minutes, relax_causes, calming_moments")
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

    // Duration preference has two possible sources. user_onboarding.target_minutes is
    // the current one — a plain integer count of minutes, collected by Focus/Sleep's
    // "How long do you usually {mode} for?" screen. user_sound_preferences.typical_duration
    // is the older free-text one ("45 min"), still owned and settable by
    // PUT /api/preferences/sound, so it is kept as a fallback rather than dropped —
    // a user who only ever set it there does not lose their duration ranking.
    //
    // Relax collects neither: target_minutes stays null for Relax users, and if
    // typical_duration is also unset the duration term is simply skipped. That is a
    // no-op, not a penalty — the term can only ever ADD to a score, so every candidate
    // is affected identically and the ordering is unchanged.
    const typicalDuration = preferences?.typical_duration
    const targetMinutes = typeof onboarding?.target_minutes === "number"
        ? onboarding.target_minutes
        : typeof typicalDuration === "string"
            ? extractMinutes(typicalDuration)
            : null
    const intensityPreference = typeof preferences?.intensity_preference === "number"
        ? preferences.intensity_preference
        : null

    const toOnboardingArray = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

    return {
        hasSignals: true,
        preferredSounds: toLowerStringSet(preferences?.preferred_sounds),
        preferredAnimals: toLowerStringSet(preferences?.preferred_animals),
        preferredInstruments: toLowerStringSet(preferences?.preferred_instruments),
        excludedSounds: toLowerStringArray(preferences?.excluded_sounds),
        detailPreference: typeof preferences?.detail_preference === "string" ? preferences.detail_preference : null,
        intensityPreference,
        mode: typeof onboarding?.mode === "string" ? onboarding.mode : null,
        modeBreakers: toOnboardingArray(onboarding?.mode_breakers),
        modeAreas: toOnboardingArray(onboarding?.mode_areas),
        targetMinutes,
        relaxCauses: toOnboardingArray(onboarding?.relax_causes),
        calmingMoments: typeof onboarding?.calming_moments === "string" ? onboarding.calming_moments : null,
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

// Shared by the mode_areas and calming_moments boosts: does any keyword from any of
// the matched sets appear in this soundscape's subcategory/description copy? Applied
// at most once per soundscape by each caller, so several matching answers cannot stack.
const matchesAnyKeyword = (soundscape: SoundscapeRow, keywordSets: string[][]): boolean => {
    const haystack = CONTEXT_TEXT_FIELDS
        .map((field) => soundscape[field])
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()

    return keywordSets.some((keywords) => keywords.some((keyword) => haystack.includes(keyword)))
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

    // target_minutes (Focus/Sleep), falling back to the older typical_duration — see
    // getUserSignals. Null for Relax users, in which case this term is skipped entirely
    // for every candidate alike: a missing duration never costs a Relax user anything.
    if (signals.targetMinutes !== null && typeof soundscape.duration_seconds === "number") {
        const soundscapeMinutes = soundscape.duration_seconds / 60
        const diff = Math.abs(signals.targetMinutes - soundscapeMinutes)
        if (diff <= 5) {
            score += 2
        } else if (diff <= 15) {
            score += 1
        }
    }

    // mode. Note this bonus is inert whenever the hard filter in
    // getRankedLiveSoundscapes is active, since every surviving candidate then shares
    // the same mode and receives it equally. It is kept for the unfiltered path and
    // because mode handling is otherwise unchanged.
    const mode = typeof soundscape.mode === "string" ? soundscape.mode : null
    if (mode && signals.mode && signals.mode === mode) {
        score += MODE_MATCH_BONUS
    }

    // mode_areas ("Where do you need it most?", Focus/Sleep) -> subcategory/description
    // soft boost, applied at most once regardless of how many areas match. Keyed on this
    // soundscape's own mode, so an area recorded under a different mode (e.g. previewing
    // another mode with ?mode=) simply finds no keywords and no-ops. Relax users have
    // mode_areas = '{}' and skip this entirely.
    if (signals.modeAreas.length > 0 && (mode === "focus" || mode === "sleep")) {
        const areaKeywords = MODE_AREA_SUBCATEGORY_KEYWORDS[mode]
        const matchedKeywordSets = signals.modeAreas
            .map((value) => areaKeywords[value.trim().toLowerCase()])
            .filter((keywords): keywords is string[] => Boolean(keywords?.length))

        if (matchedKeywordSets.length > 0 && matchesAnyKeyword(soundscape, matchedKeywordSets)) {
            score += MODE_AREA_MATCH_BONUS
        }
    }

    // calming_moments ("When do you most need to feel calmer?", Relax) -> the same
    // mechanism at a lower weight, and only for the two of four options that have a
    // lexical correlate. See CALMING_MOMENT_KEYWORDS for why this is deliberately weaker
    // than mode_areas. Focus/Sleep users have calming_moments = null and skip this.
    if (signals.calmingMoments && mode === "relax") {
        const keywords = CALMING_MOMENT_KEYWORDS[signals.calmingMoments.trim().toLowerCase()]
        if (keywords?.length && matchesAnyKeyword(soundscape, [keywords])) {
            score += CALMING_MOMENT_MATCH_BONUS
        }
    }

    // mode_breakers (Focus/Sleep) and relax_causes (Relax) -> the shared intensity
    // heuristic, plus the existing intensity_preference signal. All three read the same
    // already-existing 1-5 `intensity` field on soundscapes. Only one of the two
    // onboarding arrays is ever populated for a given user, so concatenating them is
    // safe — it is a union, not a cross-populated merge.
    if (typeof soundscape.intensity === "number") {
        const disturbances = [...signals.modeBreakers, ...signals.relaxCauses]
            .map((value) => value.trim().toLowerCase())

        if (disturbances.some((value) => MASKING_DISTURBANCES.has(value)) && soundscape.intensity >= MASKING_INTENSITY_THRESHOLD) {
            score += DISTURBANCE_ATTRIBUTE_BONUS
        }

        if (disturbances.some((value) => CALMING_DISTURBANCES.has(value)) && soundscape.intensity <= CALMING_INTENSITY_THRESHOLD) {
            score += DISTURBANCE_ATTRIBUTE_BONUS
        }

        if (signals.intensityPreference !== null) {
            const diff = Math.abs(signals.intensityPreference - soundscape.intensity)
            if (diff === 0) {
                score += INTENSITY_EXACT_MATCH_BONUS
            } else if (diff === 1) {
                score += INTENSITY_CLOSE_MATCH_BONUS
            }
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
//
// `modeOverride` is the optional ?mode=/?goal= preview param on GET /api/recommendations
// (see GetRecommendations) — it takes priority over the user's stored mode for
// this one call only and is never persisted. Absent, the stored goal (if any) is the
// hard filter; absent that too (guest, or signed-in but never onboarded), behaviour is
// unchanged from before this mode-aware pass: mixed-mode, soft-scored or play-history-sorted.
export const getRankedLiveSoundscapes = async (
    req: Request,
    cacheState?: { cacheable: boolean },
    modeOverride?: SoundscapeMode | null,
): Promise<SoundscapeRow[]> => {
    const appUserId = await getAppUserId(req, cacheState)
    const signals = await getUserSignals(appUserId)
    const modeFilter = modeOverride || (isSoundscapeMode(signals.mode) ? signals.mode : null)

    const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
        .from("soundscapes")
        .select("*")
        .eq("status", "live")

    if (soundscapesError) {
        throw soundscapesError
    }

    let rows = ((soundscapes || []) as SoundscapeRow[]).filter(
        (soundscape) => !isHardExcluded(soundscape, signals.excludedSounds)
    )

    // PRIMARY hard filter: the user's stored mode, or the preview override.
    // Applied before both branches below so a guest previewing ?mode= still gets a
    // single-mode result, and so excluded_sounds always wins regardless of mode.
    if (modeFilter) {
        rows = rows.filter((soundscape) => soundscape.mode === modeFilter)
    }

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

// Optional one-request preview override (?mode= or ?goal=, either name accepted) so the
// frontend can show "what would Sleep recommend" without changing the user's stored
// mode. Never persisted; invalid values 400 like the other query params here.
const parseModeOverride = (value: unknown): { mode: SoundscapeMode | null; error?: string } => {
    if (value === undefined) {
        return { mode: null }
    }

    if (typeof value !== "string" || !value.trim()) {
        return { mode: null }
    }

    const normalized = value.trim().toLowerCase()
    if (!isSoundscapeMode(normalized)) {
        return { mode: null, error: "mode must be one of sleep, relax, or focus" }
    }

    return { mode: normalized }
}

export const GetRecommendations = async (req: Request, res: Response) => {
    const parsedCount = parseAlternativesCount(req.query.count)

    if (parsedCount.error) {
        return res.status(400).json({ success: false, error: parsedCount.error })
    }

    const parsedMode = parseModeOverride(req.query.mode ?? req.query.goal)

    if (parsedMode.error) {
        return res.status(400).json({ success: false, error: parsedMode.error })
    }

    try {
        const cacheState = { cacheable: true }
        const keySuffixParts = ["recommendations"]
        if (parsedCount.count !== DEFAULT_ALTERNATIVES_COUNT) {
            keySuffixParts.push(`count:${parsedCount.count}`)
        }
        if (parsedMode.mode) {
            keySuffixParts.push(`mode:${parsedMode.mode}`)
        }
        const key = userCacheKey(req.user?.id, keySuffixParts.join(":"))
        const data = await remember(key, CacheTTL.USER, async () => {
            const ranked = await getRankedLiveSoundscapes(req, cacheState, parsedMode.mode)

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
