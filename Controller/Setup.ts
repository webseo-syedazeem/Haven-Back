import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_MOODS = ["calm", "tense", "anxious", "overwhelmed"]
const VALID_SLEEP = ["Restful", "Light sleep", "Watching often", "Hard to fall asleep", "Very tired"]
const VALID_DAY_FEEL = ["Busy mornings", "Long workdays", "Energy dips", "Caring for others", "Irregular routine", "Evenings feel hardest"]
const VALID_GOALS = ["Feel calmer first", "Sleep better", "Focus More", "Build healthy habits", "Stop spiraling", "Recover after work"]
const VALID_TIME = ["3 min", "5 min", "10 min", "15 min"]
const VALID_SUPPORT = ["Breathwork", "Soundscapes", "Movements", "Check-ins", "Reflection"]
const VALID_TRIGGERS = [
    "Work/study",
    "Overthinking",
    "Poor sleep",
    "Social stress",
    "Finances",
    "Health",
]

const isAllowedValue = (value: string, allowedValues: string[]) => allowedValues.includes(value)

type Activity = {
    title: string
    duration: string
    description: string
    icon: string
    type: string
}

type SetupPlanInput = {
    mood: string
    sleep_quality: string
    day_feel: string
    goal: string
    time_preference: string
    support_types: string[]
}

const ACTIVITY_POOL: Record<string, Activity> = {
    breathwork: {
        title: "Box Breathing",
        duration: "4 min",
        description: "Calm your nervous system with structured breathing",
        icon: "breath",
        type: "breathwork",
    },
    deep_breathwork: {
        title: "Deep Breathing",
        duration: "3 min",
        description: "Slow deep breaths to release tension instantly",
        icon: "breath",
        type: "breathwork",
    },
    soundscapes: {
        title: "Calming Soundscape",
        duration: "5 min",
        description: "Let soothing nature sounds melt away stress",
        icon: "waves",
        type: "soundscape",
    },
    movements: {
        title: "Gentle Stretch",
        duration: "5 min",
        description: "Light movement to release body tension",
        icon: "leaf",
        type: "movement",
    },
    check_ins: {
        title: "Mood Check-in",
        duration: "2 min",
        description: "A quick reflection to understand how you feel",
        icon: "heart",
        type: "check_in",
    },
    reflection: {
        title: "Evening Reflection",
        duration: "5 min",
        description: "Journal your thoughts to clear your mind",
        icon: "moon",
        type: "reflection",
    },
    morning_sunlight: {
        title: "Morning Sunlight",
        duration: "10 min",
        description: "Step outside for natural light to reset your mood",
        icon: "sun",
        type: "mindfulness",
    },
    wind_down: {
        title: "Wind Down",
        duration: "10 min",
        description: "Reduce screen time and prepare your mind for rest",
        icon: "moon",
        type: "sleep",
    },
    focus_session: {
        title: "Focus Reset",
        duration: "5 min",
        description: "A short mindful pause to regain clarity and focus",
        icon: "focus",
        type: "mindfulness",
    },
    gratitude: {
        title: "Gratitude Moment",
        duration: "3 min",
        description: "Note three things you are grateful for today",
        icon: "heart",
        type: "reflection",
    },
}

const PLAN_TITLES: Record<string, string> = {
    calm: "Your Daily Calm Plan",
    tense: "Your Release & Reset Plan",
    anxious: "Your Anxiety Relief Plan",
    overwhelmed: "Your Ground & Breathe Plan",
}

const PLAN_MESSAGES: Record<string, string> = {
    "Feel calmer first": "Small moments of calm add up. You've got this.",
    "Sleep better": "Rest is not a reward — it's a necessity. Start tonight.",
    "Focus More": "Clarity comes after calm. Let's reset your mind.",
    "Build healthy habits": "Every small step counts. You are building something great.",
    "Stop spiraling": "You are safe. Let's slow things down together.",
    "Recover after work": "You've worked hard. Now it's time to restore.",
}

const generatePlan = (setup: SetupPlanInput) => {
    const activities: Activity[] = []
    const {
        mood,
        sleep_quality,
        day_feel,
        goal,
        time_preference,
        support_types,
    } = setup

    const addActivity = (activityKey: string) => {
        activities.push(ACTIVITY_POOL[activityKey])
    }

    const addActivityIfMissing = (activityKey: string) => {
        const activity = ACTIVITY_POOL[activityKey]
        if (!activities.some((item) => item.title === activity.title)) {
            activities.push(activity)
        }
    }

    if (support_types.includes("Breathwork")) {
        addActivity("breathwork")
    }

    if (support_types.includes("Soundscapes")) {
        addActivity("soundscapes")
    }

    if (support_types.includes("Movements")) {
        addActivity("movements")
    }

    if (support_types.includes("Check-ins")) {
        addActivity("check_ins")
    }

    if (support_types.includes("Reflection")) {
        addActivity("reflection")
    }

    if (mood === "anxious" || mood === "overwhelmed") {
        activities.unshift(ACTIVITY_POOL.deep_breathwork)
    }

    if (mood === "calm" || mood === "tense") {
        addActivity("morning_sunlight")
    }

    if (sleep_quality === "Hard to fall asleep" || sleep_quality === "Very tired" || sleep_quality === "Watching often") {
        addActivity("wind_down")
    }

    if (sleep_quality === "Restful" || sleep_quality === "Light sleep") {
        addActivityIfMissing("morning_sunlight")
    }

    if (goal === "Focus More") {
        addActivity("focus_session")
    }

    if (goal === "Feel calmer first") {
        addActivityIfMissing("deep_breathwork")
    }

    if (goal === "Build healthy habits") {
        addActivity("gratitude")
    }

    if (goal === "Stop spiraling") {
        addActivityIfMissing("deep_breathwork")
        addActivity("check_ins")
    }

    if (goal === "Recover after work") {
        addActivityIfMissing("soundscapes")
        addActivityIfMissing("reflection")
    }

    if (goal === "Sleep better") {
        addActivityIfMissing("wind_down")
    }

    if (day_feel === "Busy mornings") {
        addActivityIfMissing("morning_sunlight")
    }

    if (day_feel === "Long workdays") {
        addActivityIfMissing("focus_session")
    }

    if (day_feel === "Energy dips") {
        addActivityIfMissing("movements")
    }

    if (day_feel === "Evenings feel hardest") {
        addActivityIfMissing("wind_down")
    }

    if (day_feel === "Irregular routine") {
        addActivityIfMissing("check_ins")
    }

    if (day_feel === "Caring for others") {
        addActivityIfMissing("gratitude")
    }

    const uniqueActivities = activities.filter((activity, index, list) => {
        return list.findIndex((item) => item.title === activity.title) === index
    })

    const limitedActivities = uniqueActivities.slice(0, 5)
    const formatDuration = (activity: Activity) => {
        const durationMinutes = Number(activity.duration.split(" ")[0])

        if (time_preference === "3 min") {
            return "3 min"
        }

        if (time_preference === "5 min" && durationMinutes > 5) {
            return "5 min"
        }

        return activity.duration
    }

    return {
        plan_title: PLAN_TITLES[mood],
        plan_subtitle: "Simple steps to help you feel better starting today",
        activities: limitedActivities.map((activity) => ({
            ...activity,
            duration: formatDuration(activity),
        })),
        message: PLAN_MESSAGES[goal],
    }
}

export const SaveSetup = async (req: Request, res: Response) => {
    const {
        mood,
        sleep_quality,
        day_feel,
        goal,
        time_preference,
        support_types,
        stress_triggers,
    } = req.body || {}

    const cleanMood = String(mood || "").trim()
    const cleanSleepQuality = String(sleep_quality || "").trim()
    const cleanDayFeel = String(day_feel || "").trim()
    const cleanGoal = String(goal || "").trim()
    const cleanTimePreference = String(time_preference || "").trim()
    const cleanSupportTypes = Array.isArray(support_types)
        ? support_types.map((supportType) => String(supportType || "").trim())
        : []
    const cleanStressTriggers = Array.isArray(stress_triggers)
        ? stress_triggers
            .map((trigger) => String(trigger || "").trim())
            .filter((trigger) => VALID_TRIGGERS.includes(trigger))
        : []

    if (!cleanMood || !cleanSleepQuality || !cleanDayFeel || !cleanGoal || !cleanTimePreference || cleanSupportTypes.length === 0) {
        return res.status(400).json({ success: false, error: "mood, sleep_quality, day_feel, goal, time_preference and support_types are required" })
    }

    if (!isAllowedValue(cleanMood, VALID_MOODS)) {
        return res.status(400).json({ success: false, error: "mood is invalid" })
    }

    if (!isAllowedValue(cleanSleepQuality, VALID_SLEEP)) {
        return res.status(400).json({ success: false, error: "sleep_quality is invalid" })
    }

    if (!isAllowedValue(cleanDayFeel, VALID_DAY_FEEL)) {
        return res.status(400).json({ success: false, error: "day_feel is invalid" })
    }

    if (!isAllowedValue(cleanGoal, VALID_GOALS)) {
        return res.status(400).json({ success: false, error: "goal is invalid" })
    }

    if (!isAllowedValue(cleanTimePreference, VALID_TIME)) {
        return res.status(400).json({ success: false, error: "time_preference is invalid" })
    }

    if (!Array.isArray(support_types) || cleanSupportTypes.some((supportType) => !isAllowedValue(supportType, VALID_SUPPORT))) {
        return res.status(400).json({ success: false, error: "support_types is invalid" })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Save setup profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const userId = userProfile.id
        const plan = generatePlan({
            mood: cleanMood,
            sleep_quality: cleanSleepQuality,
            day_feel: cleanDayFeel,
            goal: cleanGoal,
            time_preference: cleanTimePreference,
            support_types: cleanSupportTypes,
        })

        const { data: setup, error: setupError } = await supabaseAdmin
            .from("user_setup")
            .upsert({
                user_id: userId,
                mood: cleanMood,
                sleep_quality: cleanSleepQuality,
                day_feel: cleanDayFeel,
                goal: cleanGoal,
                time_preference: cleanTimePreference,
                support_types: cleanSupportTypes,
                stress_triggers: cleanStressTriggers,
                plan,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "user_id",
            })
            .select("*")
            .single()

        if (setupError) {
            console.error("Save setup error:", setupError)
            return res.status(500).json({ success: false, error: "Failed to save setup" })
        }

        return res.status(200).json({ success: true, data: { setup, plan } })
    } catch (err) {
        console.error("Error saving setup:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateSetup = async (req: Request, res: Response) => {
    const {
        mood,
        sleep_quality,
        day_feel,
        goal,
        time_preference,
        support_types,
        stress_triggers,
    } = req.body || {}

    const hasMood = mood !== undefined
    const hasSleepQuality = sleep_quality !== undefined
    const hasDayFeel = day_feel !== undefined
    const hasGoal = goal !== undefined
    const hasTimePreference = time_preference !== undefined
    const hasSupportTypes = support_types !== undefined
    const hasStressTriggers = stress_triggers !== undefined

    if (!hasMood && !hasSleepQuality && !hasDayFeel && !hasGoal && !hasTimePreference && !hasSupportTypes && !hasStressTriggers) {
        return res.status(400).json({ success: false, error: "At least one field is required to update" })
    }

    const cleanMood = hasMood ? String(mood || "").trim() : undefined
    const cleanSleepQuality = hasSleepQuality ? String(sleep_quality || "").trim() : undefined
    const cleanDayFeel = hasDayFeel ? String(day_feel || "").trim() : undefined
    const cleanGoal = hasGoal ? String(goal || "").trim() : undefined
    const cleanTimePreference = hasTimePreference ? String(time_preference || "").trim() : undefined
    const cleanSupportTypes = Array.isArray(support_types)
        ? support_types.map((supportType) => String(supportType || "").trim())
        : undefined
    const cleanStressTriggers = Array.isArray(stress_triggers)
        ? stress_triggers
            .map((trigger) => String(trigger || "").trim())
            .filter((trigger) => VALID_TRIGGERS.includes(trigger))
        : undefined

    if (cleanMood !== undefined && !VALID_MOODS.includes(cleanMood)) {
        return res.status(400).json({ success: false, error: `Invalid mood. Valid values: ${VALID_MOODS.join(", ")}` })
    }

    if (cleanSleepQuality !== undefined && !VALID_SLEEP.includes(cleanSleepQuality)) {
        return res.status(400).json({ success: false, error: `Invalid sleep_quality. Valid values: ${VALID_SLEEP.join(", ")}` })
    }

    if (cleanDayFeel !== undefined && !VALID_DAY_FEEL.includes(cleanDayFeel)) {
        return res.status(400).json({ success: false, error: `Invalid day_feel. Valid values: ${VALID_DAY_FEEL.join(", ")}` })
    }

    if (cleanGoal !== undefined && !VALID_GOALS.includes(cleanGoal)) {
        return res.status(400).json({ success: false, error: `Invalid goal. Valid values: ${VALID_GOALS.join(", ")}` })
    }

    if (cleanTimePreference !== undefined && !VALID_TIME.includes(cleanTimePreference)) {
        return res.status(400).json({ success: false, error: `Invalid time_preference. Valid values: ${VALID_TIME.join(", ")}` })
    }

    if (hasSupportTypes) {
        if (!Array.isArray(support_types) || !cleanSupportTypes || cleanSupportTypes.length === 0) {
            return res.status(400).json({ success: false, error: "support_types must be a non-empty array" })
        }

        const invalidSupport = cleanSupportTypes.filter((supportType) => !VALID_SUPPORT.includes(supportType))
        if (invalidSupport.length > 0) {
            return res.status(400).json({ success: false, error: `Invalid support_types: ${invalidSupport.join(", ")}` })
        }
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update setup profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const userId = userProfile.id

        const { data: existingSetup, error: fetchError } = await supabaseAdmin
            .from("user_setup")
            .select("*")
            .eq("user_id", userId)
            .single()

        if (fetchError || !existingSetup) {
            console.error("Fetch setup for update error:", fetchError)
            return res.status(404).json({ success: false, error: "Setup not found. Please complete setup first via POST /api/setup" })
        }

        const setupForPlan: SetupPlanInput = {
            mood: cleanMood ?? String(existingSetup.mood || ""),
            sleep_quality: cleanSleepQuality ?? String(existingSetup.sleep_quality || ""),
            day_feel: cleanDayFeel ?? String(existingSetup.day_feel || ""),
            goal: cleanGoal ?? String(existingSetup.goal || ""),
            time_preference: cleanTimePreference ?? String(existingSetup.time_preference || ""),
            support_types: cleanSupportTypes ?? (Array.isArray(existingSetup.support_types) ? existingSetup.support_types : []),
        }
        const plan = generatePlan(setupForPlan)

        const updatedData = {
            ...setupForPlan,
            ...(hasStressTriggers && cleanStressTriggers ? { stress_triggers: cleanStressTriggers } : {}),
            plan,
            updated_at: new Date().toISOString(),
        }

        const { data: updatedSetup, error: updateError } = await supabaseAdmin
            .from("user_setup")
            .update(updatedData)
            .eq("user_id", userId)
            .select("*")
            .single()

        if (updateError) {
            console.error("Update setup error:", updateError)
            return res.status(400).json({ success: false, error: updateError.message })
        }

        return res.status(200).json({ success: true, data: { setup: updatedSetup, plan } })
    } catch (err) {
        console.error("Error updating setup:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetSetup = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get setup profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const userId = userProfile.id

        const { data: setup, error: setupError } = await supabaseAdmin
            .from("user_setup")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (setupError) {
            console.error("Get setup error:", setupError)
            return res.status(500).json({ success: false, error: "Failed to get setup" })
        }

        if (!setup) {
            return res.status(200).json({ success: true, data: { setup: null, plan: null } })
        }

        const plan = setup.plan || generatePlan({
            mood: String(setup.mood || ""),
            sleep_quality: String(setup.sleep_quality || ""),
            day_feel: String(setup.day_feel || ""),
            goal: String(setup.goal || ""),
            time_preference: String(setup.time_preference || ""),
            support_types: Array.isArray(setup.support_types) ? setup.support_types : [],
        })

        return res.status(200).json({ success: true, data: { setup, plan } })
    } catch (err) {
        console.error("Error getting setup:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
