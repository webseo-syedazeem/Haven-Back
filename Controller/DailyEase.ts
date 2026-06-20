import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

// ─── helpers ────────────────────────────────────────────────────────────────

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const clamp = (value: number, min = 0, max = 100) =>
    Math.min(Math.max(Math.round(value), min), max)

// ─── per-component scorers ───────────────────────────────────────────────────

const scoreSleep = (sleepQuality: string | null): number => {
    switch (sleepQuality) {
        case "Restful": return 100
        case "Light sleep": return 70
        case "Waking often": return 45
        case "Hard to fall asleep": return 30
        case "Very tired": return 15
        default: return 0
    }
}

/**
 * BREATHWORK (0-100)
 * Source: user_breathing_sessions (completed = true, created today)
 * Target: at least 1 completed session today  →  100
 * Partial credit for partially completed sessions.
 */
const scoreBreathwork = (sessions: Array<{
    completed: boolean
    completed_duration_seconds: number | null
    total_duration_seconds: number | null
}>): number => {
    if (!sessions.length) return 0

    const completedSession = sessions.find((s) => s.completed)
    if (completedSession) return 100

    // partial credit – best partially-done session
    const best = sessions.reduce((max, s) => {
        const done = Number(s.completed_duration_seconds ?? 0)
        const total = Number(s.total_duration_seconds ?? 1)
        return Math.max(max, done / total)
    }, 0)

    return clamp(best * 80) // max 80 for incomplete
}

/**
 * SOUNDSCAPE (0-100) — proxy for movement since no step counter
 * Source: user_soundscape_mixes last_played_at updated today
 * Any mix played today → 100
 */
const scoreSoundscape = (mixes: Array<{ last_played_at: string | null }>): number => {
    const today = getTodayDate()
    const playedToday = mixes.some(
        (m) => m.last_played_at && m.last_played_at.startsWith(today),
    )
    return playedToday ? 100 : 0
}

/**
 * TASKS / CHECKLIST (0-100)
 * Source: user_checklists for today → percentage field (0-100)
 */
const scoreChecklist = (checklist: { percentage: number } | null): number => {
    if (!checklist) return 0
    return clamp(checklist.percentage)
}

/**
 * MOOD CHECK-INS (0-100)
 * Source: user_moods created today
 * Brief says 2 check-ins = full score.
 * 1 check-in → 60, 2+ → 100
 */
const scoreMood = (moods: Array<{ created_at: string }>): number => {
    const today = getTodayDate()
    const todayMoods = moods.filter((m) => m.created_at.startsWith(today))
    if (todayMoods.length === 0) return 0
    if (todayMoods.length === 1) return 60
    return 100
}

/**
 * HELPFUL_TODAY bonus (0-100)
 * Source: daily_checkins.helpful_today for today
 * Used as a soft signal to boost breathwork/soundscape/movement
 * if user did them outside the app (self-reported fallback).
 * Weight is lower (only used when app-tracked score is 0).
 */
const scoreHelpfulToday = (
    helpfulToday: string[],
    component: "Breathwork" | "Soundscape" | "Movements",
): number => {
    return helpfulToday.includes(component) ? 60 : 0
    // 60 not 100 – self-reported is less reliable than app-tracked
}

// ─── weight sets by user goal ────────────────────────────────────────────────

type Weights = {
    sleep: number
    movement: number
    breathwork: number
    tasks: number
    mood: number
}

export type DailyEaseResult = {
    daily_ease: {
        score: number
        label: string
    }
    stress_today: {
        score: number
        label: string
    } | null
    insight: string
    breakdown: {
        sleep: { score: number; quality: string | null }
        breathwork: { score: number; app_tracked: boolean }
        soundscape: { score: number; app_tracked: boolean }
        tasks: { score: number; completed: string[] }
        mood: { score: number; checkins_today: number }
    }
    date: string
}

const getWeights = (goal: string): Weights => {
    switch (goal) {
        case "Sleep better":
            return { sleep: 0.40, movement: 0.15, breathwork: 0.20, tasks: 0.15, mood: 0.10 }
        case "Focus More":
            return { sleep: 0.25, movement: 0.15, breathwork: 0.20, tasks: 0.30, mood: 0.10 }
        case "Feel calmer first":
        case "Stop spiraling":
            return { sleep: 0.25, movement: 0.15, breathwork: 0.35, tasks: 0.15, mood: 0.10 }
        case "Recover after work":
            return { sleep: 0.30, movement: 0.15, breathwork: 0.20, tasks: 0.10, mood: 0.25 }
        case "Build healthy habits":
            return { sleep: 0.25, movement: 0.15, breathwork: 0.20, tasks: 0.30, mood: 0.10 }
        default:
            // brief default formula (no wearables, soundscape as movement proxy)
            return { sleep: 0.30, movement: 0.25, breathwork: 0.20, tasks: 0.15, mood: 0.10 }
    }
}

// ─── label helpers ───────────────────────────────────────────────────────────

const getDailyEaseLabel = (score: number): string => {
    if (score >= 80) return "Strong support"
    if (score >= 60) return "Supported"
    if (score >= 40) return "Steady"
    if (score >= 20) return "Needs care"
    return "Low support"
}

const getInsightMessage = (
    easeScore: number,
    stressLevel: number | null,
    goal: string,
): string => {
    // High ease + high stress
    if (easeScore >= 60 && stressLevel !== null && stressLevel >= 7) {
        return "You did the right things today. External pressure may have been high — that counts as strength."
    }
    // Low ease + high stress
    if (easeScore < 40 && stressLevel !== null && stressLevel >= 7) {
        return "Your body may not have had enough recovery support today. Even one small reset helps."
    }
    // Good day
    if (easeScore >= 80 && (stressLevel === null || stressLevel <= 4)) {
        return "Strong support day. Your habits are working — keep this momentum."
    }
    // Goal-specific
    if (goal === "Sleep better") {
        return "A good wind-down tonight can change how tomorrow feels."
    }
    if (goal === "Focus More") {
        return "Clarity follows calm. Tick one more task to close the day strong."
    }
    return "Every check-in helps Haven understand your pattern better. Keep going!"
}

// ─── main controller ─────────────────────────────────────────────────────────

export const CalculateDailyEase = async (
    userId: string,
    today = getTodayDate(),
): Promise<DailyEaseResult> => {
    const { data: setup } = await supabaseAdmin
        .from("user_setup")
        .select("goal, support_types")
        .eq("user_id", userId)
        .maybeSingle()

    const goal = String(setup?.goal ?? "")
    const supportTypes: string[] = Array.isArray(setup?.support_types)
        ? setup.support_types
        : []

    const [
        breathingResult,
        soundscapeResult,
        checklistResult,
        moodResult,
        checkinResult,
        trackResult,
    ] = await Promise.all([
        supabaseAdmin
            .from("user_breathing_sessions")
            .select("completed, completed_duration_seconds, total_duration_seconds")
            .eq("user_id", userId)
            .gte("created_at", `${today}T00:00:00.000Z`)
            .lte("created_at", `${today}T23:59:59.999Z`),

        supabaseAdmin
            .from("user_soundscape_mixes")
            .select("last_played_at")
            .eq("user_id", userId),

        supabaseAdmin
            .from("user_checklists")
            .select("percentage, completed_tasks")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),

        supabaseAdmin
            .from("user_moods")
            .select("created_at")
            .eq("user_id", userId)
            .gte("created_at", `${today}T00:00:00.000Z`)
            .lte("created_at", `${today}T23:59:59.999Z`),

        supabaseAdmin
            .from("daily_checkins")
            .select("stress_level, stress_label, helpful_today, insight_message")
            .eq("user_id", userId)
            .gte("created_at", `${today}T00:00:00.000Z`)
            .lte("created_at", `${today}T23:59:59.999Z`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),

        supabaseAdmin
            .from("user_tracks")
            .select("sleep_quality")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
    ])

    const breathingSessions = breathingResult.data ?? []
    const soundscapeMixes = soundscapeResult.data ?? []
    const checklist = checklistResult.data ?? null
    const moods = moodResult.data ?? []
    const checkin = checkinResult.data ?? null
    const helpfulToday: string[] = checkin?.helpful_today ?? []
    const stressLevel: number | null = checkin?.stress_level ?? null

    const sleepScore = scoreSleep(trackResult.data?.sleep_quality ?? null)

    const rawBreathwork = scoreBreathwork(breathingSessions)
    const breathworkScore =
        rawBreathwork > 0
            ? rawBreathwork
            : supportTypes.includes("Breathwork")
                ? scoreHelpfulToday(helpfulToday, "Breathwork")
                : 0

    const rawSoundscape = scoreSoundscape(soundscapeMixes)
    const soundscapeScore =
        rawSoundscape > 0
            ? rawSoundscape
            : supportTypes.includes("Soundscapes")
                ? scoreHelpfulToday(helpfulToday, "Soundscape")
                : 0

    const taskScore = scoreChecklist(checklist)
    const moodScore = scoreMood(moods)
    const weights = getWeights(goal)

    const dailyEaseScore = clamp(
        sleepScore      * weights.sleep      +
        soundscapeScore * weights.movement   +
        breathworkScore * weights.breathwork +
        taskScore       * weights.tasks      +
        moodScore       * weights.mood,
    )

    const dailyEaseLabel = getDailyEaseLabel(dailyEaseScore)
    const insight = getInsightMessage(dailyEaseScore, stressLevel, goal)

    const breakdown = {
        sleep:      { score: sleepScore,      quality: trackResult.data?.sleep_quality ?? null },
        breathwork: { score: breathworkScore, app_tracked: rawBreathwork > 0 },
        soundscape: { score: soundscapeScore, app_tracked: rawSoundscape > 0 },
        tasks:      { score: taskScore,        completed: checklist?.completed_tasks ?? [] },
        mood:       { score: moodScore,        checkins_today: moods.length },
    }

    const stressToday = checkin
        ? {
            score: checkin.stress_level,
            label: checkin.stress_label,
        }
        : null

    return {
        daily_ease: {
            score: dailyEaseScore,
            label: dailyEaseLabel,
        },
        stress_today: stressToday,
        insight,
        breakdown,
        date: today,
    }
}
export const GetDailyEase = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        // 1. resolve internal user id
        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const dailyEase = await CalculateDailyEase(userProfile.id, getTodayDate())

        return res.status(200).json({
            success: true,
            data: dailyEase,
        })
    } catch (err) {
        console.error("Error getting daily ease:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
