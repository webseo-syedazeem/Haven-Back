import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

type RecordMap = Record<string, unknown>

const getDateKey = (value: unknown) => {
    return String(value || "").slice(0, 10)
}

const average = (values: number[]) => {
    if (values.length === 0) {
        return 0
    }

    const total = values.reduce((sum, value) => sum + value, 0)
    return Number((total / values.length).toFixed(1))
}

const numberValue = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

export const GetProgress = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get progress profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const thirtyDaysAgoDate = thirtyDaysAgo.slice(0, 10)

        const [
            checkinsResult,
            tracksResult,
            checklistsResult,
            moodsResult,
            breathingResult,
            soundscapeResult,
        ] = await Promise.all([
            supabaseAdmin
                .from("daily_checkins")
                .select("stress_level, helpful_today, daily_ease, created_at")
                .eq("user_id", userProfile.id)
                .gte("created_at", thirtyDaysAgo),
            supabaseAdmin
                .from("user_tracks")
                .select("sleep_quality, date")
                .eq("user_id", userProfile.id)
                .gte("date", thirtyDaysAgoDate),
            supabaseAdmin
                .from("user_checklists")
                .select("completed_tasks, percentage, date")
                .eq("user_id", userProfile.id)
                .gte("date", thirtyDaysAgoDate),
            supabaseAdmin
                .from("user_moods")
                .select("mood, created_at")
                .eq("user_id", userProfile.id)
                .gte("created_at", thirtyDaysAgo),
            supabaseAdmin
                .from("user_breathing_sessions")
                .select("completed, type, created_at")
                .eq("user_id", userProfile.id)
                .eq("completed", true)
                .gte("created_at", thirtyDaysAgo),
            supabaseAdmin
                .from("user_soundscape_mixes")
                .select("created_at")
                .eq("user_id", userProfile.id)
                .gte("created_at", thirtyDaysAgo),
        ])

        if (checkinsResult.error) {
            console.error("Get progress checkins error:", checkinsResult.error)
            return res.status(500).json({ success: false, error: "Failed to get checkins progress" })
        }

        if (tracksResult.error) {
            console.error("Get progress tracks error:", tracksResult.error)
            return res.status(500).json({ success: false, error: "Failed to get tracks progress" })
        }

        if (checklistsResult.error) {
            console.error("Get progress checklists error:", checklistsResult.error)
            return res.status(500).json({ success: false, error: "Failed to get checklists progress" })
        }

        if (moodsResult.error) {
            console.error("Get progress moods error:", moodsResult.error)
            return res.status(500).json({ success: false, error: "Failed to get moods progress" })
        }

        if (breathingResult.error) {
            console.error("Get progress breathing error:", breathingResult.error)
            return res.status(500).json({ success: false, error: "Failed to get breathing progress" })
        }

        if (soundscapeResult.error) {
            console.error("Get progress soundscape error:", soundscapeResult.error)
            return res.status(500).json({ success: false, error: "Failed to get soundscape progress" })
        }

        const checkins = (checkinsResult.data || []) as RecordMap[]
        const tracks = (tracksResult.data || []) as RecordMap[]
        const checklists = (checklistsResult.data || []) as RecordMap[]
        const moods = (moodsResult.data || []) as RecordMap[]
        const breathingSessions = (breathingResult.data || []) as RecordMap[]
        const soundscapeMixes = (soundscapeResult.data || []) as RecordMap[]

        const checkinsByDate = new Map<string, RecordMap>()
        const trackByDate = new Map<string, RecordMap>()
        const checklistByDate = new Map<string, RecordMap>()

        checkins.forEach((checkin) => {
            checkinsByDate.set(getDateKey(checkin.created_at), checkin)
        })

        tracks.forEach((track) => {
            trackByDate.set(getDateKey(track.date), track)
        })

        checklists.forEach((checklist) => {
            checklistByDate.set(getDateKey(checklist.date), checklist)
        })

        const breathworkStress: number[] = []
        const noBreathworkStress: number[] = []
        const sleepStress = new Map<string, number[]>()
        const highCompletionStress: number[] = []
        const lowCompletionStress: number[] = []
        const moodFrequency: Record<string, number> = {}
        const breathingUsage: Record<string, number> = {}

        checkins.forEach((checkin) => {
            const stressLevel = numberValue(checkin.stress_level)

            if (stressLevel === null) {
                return
            }

            const helpfulToday = Array.isArray(checkin.helpful_today) ? checkin.helpful_today.map((item) => String(item)) : []

            if (helpfulToday.includes("Breathwork")) {
                breathworkStress.push(stressLevel)
            } else {
                noBreathworkStress.push(stressLevel)
            }

            const track = trackByDate.get(getDateKey(checkin.created_at))
            const sleepQuality = String(track?.sleep_quality || "")

            if (sleepQuality) {
                const values = sleepStress.get(sleepQuality) || []
                values.push(stressLevel)
                sleepStress.set(sleepQuality, values)
            }

            const checklist = checklistByDate.get(getDateKey(checkin.created_at))
            const percentage = numberValue(checklist?.percentage)

            if (percentage !== null) {
                if (percentage >= 60) {
                    highCompletionStress.push(stressLevel)
                } else {
                    lowCompletionStress.push(stressLevel)
                }
            }
        })

        moods.forEach((moodRow) => {
            const mood = String(moodRow.mood || "")

            if (mood) {
                moodFrequency[mood] = (moodFrequency[mood] || 0) + 1
            }
        })

        breathingSessions.forEach((session) => {
            const type = String(session.type || "")

            if (type) {
                breathingUsage[type] = (breathingUsage[type] || 0) + 1
            }
        })

        const sleepVsStress = Array.from(sleepStress.entries()).map(([sleepQuality, values]) => ({
            sleep_quality: sleepQuality,
            avg_stress: average(values),
        }))

        const dailyEaseTrend = checkins
            .map((checkin) => ({
                date: getDateKey(checkin.created_at),
                daily_ease: numberValue(checkin.daily_ease) || 0,
                stress_level: numberValue(checkin.stress_level) || 0,
            }))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-14)

        const breathworkAvg = average(breathworkStress)
        const noBreathworkAvg = average(noBreathworkStress)
        const highCompletionAvg = average(highCompletionStress)
        const lowCompletionAvg = average(lowCompletionStress)

        const progress = {
            stress_vs_breathwork: {
                breathwork_days_avg_stress: breathworkAvg,
                no_breathwork_days_avg_stress: noBreathworkAvg,
                insight: breathworkAvg && noBreathworkAvg && breathworkAvg < noBreathworkAvg
                    ? "On days with breathwork, stress tends to be lower"
                    : "Breathwork patterns are still forming as more check-ins are added",
            },
            sleep_vs_stress: sleepVsStress,
            tasks_vs_stress: {
                high_completion_avg_stress: highCompletionAvg,
                low_completion_avg_stress: lowCompletionAvg,
                insight: highCompletionAvg && lowCompletionAvg && highCompletionAvg < lowCompletionAvg
                    ? "More tasks completed may be linked to lower stress"
                    : "Checklist and stress patterns are still forming as more days are tracked",
            },
            mood_frequency: moodFrequency,
            breathing_usage: breathingUsage,
            soundscape_usage_count: soundscapeMixes.length,
            daily_ease_trend: dailyEaseTrend,
            summary_insight: sleepVsStress.length > 0
                ? "Better sleep appears to support lower stress, and your daily patterns will get clearer with consistent tracking"
                : "Your progress insights will get clearer as more daily check-ins, tracks, and tool usage are logged",
        }

        return res.status(200).json({ success: true, data: { progress } })
    } catch (err) {
        console.error("Error getting progress:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
