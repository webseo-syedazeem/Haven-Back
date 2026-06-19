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
                .select("stress_level, helpful_today, created_at")
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
                .select("completed, type, created_at, completed_duration_seconds")
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

        const breathingDates = new Set<string>()
        breathingSessions.forEach((session) => {
            breathingDates.add(getDateKey(session.created_at))
        })

        const soundscapeDates = new Set<string>()
        soundscapeMixes.forEach((mix) => {
            const date = getDateKey(mix.created_at)

            if (date) {
                soundscapeDates.add(date)
            }
        })

        const moodsByDate = new Map<string, Record<string, number>>()
        moods.forEach((moodRow) => {
            const date = getDateKey(moodRow.created_at)
            const mood = String(moodRow.mood || "")

            if (!date || !mood) {
                return
            }

            const counts = moodsByDate.get(date) || {}
            counts[mood] = (counts[mood] || 0) + 1
            moodsByDate.set(date, counts)
        })

        const breathworkStress: number[] = []
        const noBreathworkStress: number[] = []
        const soundscapeStress: number[] = []
        const noSoundscapeStress: number[] = []
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

            if (soundscapeDates.has(getDateKey(checkin.created_at))) {
                soundscapeStress.push(stressLevel)
            } else {
                noSoundscapeStress.push(stressLevel)
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

        const sleepQualityValues = ["Restful", "Light sleep", "Waking often", "Hard to fall asleep", "Very tired"]
        const sleepVsMood = sleepQualityValues.map((sleepQuality) => {
            const moodCounts: Record<string, number> = {}

            tracks.forEach((track) => {
                if (String(track.sleep_quality || "") !== sleepQuality) {
                    return
                }

                const dateMoodCounts = moodsByDate.get(getDateKey(track.date)) || {}
                Object.entries(dateMoodCounts).forEach(([mood, count]) => {
                    moodCounts[mood] = (moodCounts[mood] || 0) + count
                })
            })

            const mostFrequentMood = Object.entries(moodCounts)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || null

            return {
                sleep_quality: sleepQuality,
                most_frequent_mood: mostFrequentMood,
                mood_counts: moodCounts,
            }
        })

        const lastThirtyDateKeys = Array.from({ length: 30 }, (_, index) => {
            const date = new Date()
            date.setDate(date.getDate() - (29 - index))
            return date.toISOString().slice(0, 10)
        })

        const soundscapeCountsByDate = new Map<string, number>()
        soundscapeMixes.forEach((mix) => {
            const date = getDateKey(mix.created_at)

            if (date) {
                soundscapeCountsByDate.set(date, (soundscapeCountsByDate.get(date) || 0) + 1)
            }
        })

        const breathingSecondsByDate = new Map<string, number>()
        breathingSessions.forEach((session) => {
            const date = getDateKey(session.created_at)
            const duration = numberValue(session.completed_duration_seconds) || 0

            if (date) {
                breathingSecondsByDate.set(date, (breathingSecondsByDate.get(date) || 0) + duration)
            }
        })

        const breathworkBuckets = new Map<number, number[]>([
            [0, []],
            [15, []],
            [30, []],
            [45, []],
            [60, []],
        ])
        const movementBuckets = new Map<number, number[]>([
            [0, []],
            [2000, []],
            [4000, []],
            [6000, []],
            [10000, []],
        ])
        const taskBuckets = new Map<number, number[]>([
            [0, []],
            [25, []],
            [50, []],
            [75, []],
            [100, []],
        ])

        const getBreathworkBucket = (minutes: number) => {
            if (minutes <= 0) return 0
            if (minutes <= 15) return 15
            if (minutes <= 30) return 30
            if (minutes <= 45) return 45
            return 60
        }

        const getMovementBucket = (mixCount: number) => {
            if (mixCount <= 0) return 0
            if (mixCount === 1) return 2000
            if (mixCount === 2) return 4000
            if (mixCount === 3) return 6000
            return 10000
        }

        const getTaskBucket = (percentage: number) => {
            if (percentage <= 0) return 0
            if (percentage <= 25) return 25
            if (percentage <= 50) return 50
            if (percentage <= 75) return 75
            return 100
        }

        lastThirtyDateKeys.forEach((date) => {
            const stressLevel = numberValue(checkinsByDate.get(date)?.stress_level)

            if (stressLevel === null) {
                return
            }

            const breathworkMinutes = (breathingSecondsByDate.get(date) || 0) / 60
            const breathworkBucket = getBreathworkBucket(breathworkMinutes)
            breathworkBuckets.get(breathworkBucket)?.push(stressLevel)

            const movementBucket = getMovementBucket(soundscapeCountsByDate.get(date) || 0)
            movementBuckets.get(movementBucket)?.push(stressLevel)

            const checklistPercentage = numberValue(checklistByDate.get(date)?.percentage)
            if (checklistPercentage !== null) {
                const taskBucket = getTaskBucket(checklistPercentage)
                taskBuckets.get(taskBucket)?.push(stressLevel)
            }
        })

        const breathworkChartData = [0, 15, 30, 45, 60].map((minutes) => ({
            minutes,
            avg_stress: average(breathworkBuckets.get(minutes) || []),
        }))

        const movementChartBuckets = [
            { steps_label: "0", step_value: 0 },
            { steps_label: "2k", step_value: 2000 },
            { steps_label: "4k", step_value: 4000 },
            { steps_label: "6k", step_value: 6000 },
            { steps_label: "10k", step_value: 10000 },
        ]
        const movementChartData = movementChartBuckets.map((bucket) => ({
            ...bucket,
            avg_stress: average(movementBuckets.get(bucket.step_value) || []),
        }))

        const sleepHoursByQuality: Record<string, number> = {
            Restful: 9,
            "Light sleep": 6,
            "Waking often": 5,
            "Hard to fall asleep": 4,
            "Very tired": 4,
        }
        const sleepMoodBuckets = new Map<number, { stress: number[]; moods: Record<string, number> }>([
            [4, { stress: [], moods: {} }],
            [5, { stress: [], moods: {} }],
            [6, { stress: [], moods: {} }],
            [7, { stress: [], moods: {} }],
            [8, { stress: [], moods: {} }],
            [9, { stress: [], moods: {} }],
        ])

        tracks.forEach((track) => {
            const hours = sleepHoursByQuality[String(track.sleep_quality || "")]

            if (!hours) {
                return
            }

            const date = getDateKey(track.date)
            const bucket = sleepMoodBuckets.get(hours)
            const stressLevel = numberValue(checkinsByDate.get(date)?.stress_level)

            if (!bucket) {
                return
            }

            if (stressLevel !== null) {
                bucket.stress.push(stressLevel)
            }

            const dateMoodCounts = moodsByDate.get(date) || {}
            Object.entries(dateMoodCounts).forEach(([mood, count]) => {
                bucket.moods[mood] = (bucket.moods[mood] || 0) + count
            })
        })

        const sleepMoodChartData = [4, 5, 6, 7, 8, 9].map((hours) => {
            const bucket = sleepMoodBuckets.get(hours) || { stress: [], moods: {} }
            const mostFrequentMood = Object.entries(bucket.moods)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || null

            return {
                hours,
                avg_stress: average(bucket.stress),
                most_frequent_mood: mostFrequentMood,
            }
        })

        const tasksChartData = [0, 25, 50, 75, 100].map((completionPct) => ({
            completion_pct: completionPct,
            avg_stress: average(taskBuckets.get(completionPct) || []),
        }))

        const sleepStressChartData = sleepQualityValues.map((sleepQuality) => ({
            sleep_quality: sleepQuality,
            avg_stress: average(sleepStress.get(sleepQuality) || []),
        }))

        const moodFrequencyChartData = ["Calm", "Tense", "Anxious", "Overwhelmed", "Low", "Energised"].map((mood) => ({
            mood,
            count: moodFrequency[mood] || 0,
        }))

        const breathingUsageChartData = [
            "Box Breathing",
            "4-7-8 Sleep Reset",
            "Physiological Sigh",
            "Resonant Breathing",
            "Focus Reset",
            "Morning Lift",
        ].map((type) => ({
            type,
            count: breathingUsage[type] || 0,
        }))

        const soundscapeChartData = Array.from(soundscapeCountsByDate.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date))
        const dailyEaseTrend = checkins
            .map((checkin) => {
                const date = getDateKey(checkin.created_at)
                const checklist = checklistByDate.get(date)
                const tasksScore = numberValue(checklist?.percentage) ?? 0
                const breathworkScore = breathingDates.has(date) ? 100 : 0
                const trendEase = Math.round((tasksScore * 0.40) + (breathworkScore * 0.60))
                return {
                    date,
                    daily_ease: trendEase,
                    stress_level: numberValue(checkin.stress_level) || 0,
                }
            })
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-30)

        const breathworkAvg = average(breathworkStress)
        const noBreathworkAvg = average(noBreathworkStress)
        const soundscapeAvg = average(soundscapeStress)
        const noSoundscapeAvg = average(noSoundscapeStress)
        const highCompletionAvg = average(highCompletionStress)
        const lowCompletionAvg = average(lowCompletionStress)
        const hasBreathworkPattern = Boolean(breathworkAvg && noBreathworkAvg && breathworkAvg < noBreathworkAvg)
        const hasSleepPattern = sleepVsStress.length > 0
        const hasSoundscapePattern = Boolean(soundscapeAvg && noSoundscapeAvg && soundscapeAvg < noSoundscapeAvg)
        const soundscapeInsight = hasSoundscapePattern
            ? "On days with soundscape use, stress appears to be lower"
            : "Still forming patterns"
        const summaryInsight = hasBreathworkPattern
            ? "Your data suggests breathwork may be linked to lower evening stress"
            : hasSoundscapePattern
                ? "Soundscapes appear to support lower stress on the days you use them"
                : hasSleepPattern
                    ? "Your sleep patterns may be linked to stress, and the insight will get clearer with more tracks"
                    : "Your progress insights will get clearer as more daily check-ins, tracks, and tool usage are logged"

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
            movement_vs_stress: {
                soundscape_days_avg_stress: soundscapeAvg,
                no_soundscape_days_avg_stress: noSoundscapeAvg,
                insight: hasSoundscapePattern
                    ? "On days you used soundscapes, your evening stress tends to be lower"
                    : "Soundscape and stress patterns are still forming as more data is logged",
            },
            sleep_vs_mood: sleepVsMood,
            sleep_stress_chart_data: sleepStressChartData,
            sleep_mood_chart_data: sleepMoodChartData,
            breathwork_chart_data: breathworkChartData,
            movement_chart_data: movementChartData,
            tasks_chart_data: tasksChartData,
            mood_frequency_chart_data: moodFrequencyChartData,
            breathing_usage_chart_data: breathingUsageChartData,
            soundscape_chart_data: soundscapeChartData,
            daily_ease_vs_stress_chart_data: dailyEaseTrend.map((item) => ({
                date: item.date,
                daily_ease: item.daily_ease,
                stress_level: item.stress_level,
            })),
            summary_insight: summaryInsight,
        }

        return res.status(200).json({ success: true, data: { progress } })
    } catch (err) {
        console.error("Error getting progress:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
