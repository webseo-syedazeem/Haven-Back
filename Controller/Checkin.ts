import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_STRESS_FACTORS = [
    "Work/study",
    "Overthinking",
    "Poor sleep",
    "Social stress",
    "Finances",
    "Health",
]

const VALID_HELPFUL = [
    "Breathwork",
    "Movements",
    "Soundscape",
    "meditation",
    "Journaling",
    "Rest",
]

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const getStressLabel = (level: number): string => {
    if (level <= 3) return "Low"
    if (level <= 6) return "Moderate"
    if (level <= 8) return "High"
    return "Very High"
}

const getInsightMessage = (
    stress_level: number,
    helpful_today: string[],
    stress_factors: string[]
): string => {
    if (stress_level >= 8) {
        return "Even on higher days your body still needs support. Small steps, real changes."
    }
    if (stress_level >= 6 && helpful_today.length >= 2) {
        return "You showed up for yourself today. That already counts as progress."
    }
    if (stress_factors.includes("Poor sleep")) {
        return "Sleep shapes everything. A wind-down routine tonight could change tomorrow."
    }
    if (stress_factors.includes("Overthinking")) {
        return "Your mind is working hard. Give it permission to rest."
    }
    if (stress_factors.includes("Work/study")) {
        return "A busy mind needs recovery time. You are doing better than you think."
    }
    if (helpful_today.length >= 3) {
        return "You are building calm, and consistency. Keep going!"
    }
    if (stress_level <= 3) {
        return "You are in a good place today. Carry this calm into tomorrow."
    }
    return "Every check-in helps Heaven understand your pattern better."
}

export const SaveCheckin = async (req: Request, res: Response) => {
    const {
        stress_level,
        stress_factors,
        helpful_today,
        reflection,
    } = req.body || {}

    if (!Number.isInteger(stress_level) || stress_level < 0 || stress_level > 10) {
        return res.status(400).json({ success: false, error: "stress_level must be an integer between 0 and 10" })
    }

    if (!Array.isArray(stress_factors) || stress_factors.length === 0) {
        return res.status(400).json({ success: false, error: "stress_factors must be a non-empty array" })
    }

    const cleanStressFactors = stress_factors.map((sf) => String(sf || "").trim())
    const invalidStressFactors = cleanStressFactors.filter((sf) => !VALID_STRESS_FACTORS.includes(sf))

    if (invalidStressFactors.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid stress_factors: ${invalidStressFactors.join(", ")}` })
    }

    if (!Array.isArray(helpful_today) || helpful_today.length === 0) {
        return res.status(400).json({ success: false, error: "helpful_today must be a non-empty array" })
    }

    const cleanHelpfulToday = helpful_today.map((h) => String(h || "").trim())
    const invalidHelpful = cleanHelpfulToday.filter((h) => !VALID_HELPFUL.includes(h))

    if (invalidHelpful.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid helpful_today: ${invalidHelpful.join(", ")}` })
    }

    if (reflection !== undefined && typeof reflection !== "string") {
        return res.status(400).json({ success: false, error: "reflection must be a string" })
    }

    try {
        const user = req.user!
        const today = getTodayDate()

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Save checkin profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingCheckin } = await supabaseAdmin
            .from("daily_checkins")
            .select("id")
            .eq("user_id", userProfile.id)
            .gte("created_at", `${today}T00:00:00.000Z`)
            .lte("created_at", `${today}T23:59:59.999Z`)
            .maybeSingle()

        if (existingCheckin) {
            return res.status(400).json({
                success: false,
                error: "You have already submitted today's check-in. Use PUT to update it.",
            })
        }

        const stressLabel = getStressLabel(stress_level)
        const insightMessage = getInsightMessage(stress_level, cleanHelpfulToday, cleanStressFactors)

        const { data: checkin, error: checkinError } = await supabaseAdmin
            .from("daily_checkins")
            .insert({
                user_id: userProfile.id,
                stress_level,
                stress_factors: cleanStressFactors,
                helpful_today: cleanHelpfulToday,
                reflection: reflection ? String(reflection).trim() : "",
                stress_label: stressLabel,
                insight_message: insightMessage,
            })
            .select("*")
            .single()

        if (checkinError) {
            console.error("Save checkin error:", checkinError)
            return res.status(500).json({ success: false, error: "Failed to save checkin" })
        }

        return res.status(200).json({
            success: true,
            data: {
                checkin,
                result: {
                    stress_today: {
                        score: stress_level,
                        label: stressLabel,
                    },
                    insight: insightMessage,
                },
            },
        })
    } catch (err) {
        console.error("Error saving checkin:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateCheckin = async (req: Request, res: Response) => {
    const {
        stress_level,
        stress_factors,
        helpful_today,
        reflection,
    } = req.body || {}

    if (!Number.isInteger(stress_level) || stress_level < 0 || stress_level > 10) {
        return res.status(400).json({ success: false, error: "stress_level must be an integer between 0 and 10" })
    }

    if (!Array.isArray(stress_factors) || stress_factors.length === 0) {
        return res.status(400).json({ success: false, error: "stress_factors must be a non-empty array" })
    }

    const cleanStressFactors = stress_factors.map((sf) => String(sf || "").trim())
    const invalidStressFactors = cleanStressFactors.filter((sf) => !VALID_STRESS_FACTORS.includes(sf))

    if (invalidStressFactors.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid stress_factors: ${invalidStressFactors.join(", ")}` })
    }

    if (!Array.isArray(helpful_today) || helpful_today.length === 0) {
        return res.status(400).json({ success: false, error: "helpful_today must be a non-empty array" })
    }

    const cleanHelpfulToday = helpful_today.map((h) => String(h || "").trim())
    const invalidHelpful = cleanHelpfulToday.filter((h) => !VALID_HELPFUL.includes(h))

    if (invalidHelpful.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid helpful_today: ${invalidHelpful.join(", ")}` })
    }

    if (reflection !== undefined && typeof reflection !== "string") {
        return res.status(400).json({ success: false, error: "reflection must be a string" })
    }

    try {
        const user = req.user!
        const today = getTodayDate()

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update checkin profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingCheckin, error: existingCheckinError } = await supabaseAdmin
            .from("daily_checkins")
            .select("id")
            .eq("user_id", userProfile.id)
            .gte("created_at", `${today}T00:00:00.000Z`)
            .lte("created_at", `${today}T23:59:59.999Z`)
            .maybeSingle()

        if (existingCheckinError) {
            console.error("Find checkin error:", existingCheckinError)
            return res.status(500).json({ success: false, error: "Failed to find today's check-in" })
        }

        if (!existingCheckin) {
            return res.status(404).json({ success: false, error: "No check-in found for today" })
        }

        const stressLabel = getStressLabel(stress_level)
        const insightMessage = getInsightMessage(stress_level, cleanHelpfulToday, cleanStressFactors)

        const { data: updatedCheckin, error: updateError } = await supabaseAdmin
            .from("daily_checkins")
            .update({
                stress_level,
                stress_factors: cleanStressFactors,
                helpful_today: cleanHelpfulToday,
                reflection: reflection ? String(reflection).trim() : "",
                stress_label: stressLabel,
                insight_message: insightMessage,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingCheckin.id)
            .select("*")
            .single()

        if (updateError) {
            console.error("Update checkin error:", updateError)
            return res.status(500).json({ success: false, error: "Failed to update check-in" })
        }

        return res.status(200).json({
            success: true,
            data: {
                checkin: updatedCheckin,
                result: {
                    stress_today: {
                        score: stress_level,
                        label: stressLabel,
                    },
                    insight: insightMessage,
                },
            },
        })
    } catch (err) {
        console.error("Error updating checkin:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetCheckins = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get checkins profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: checkins, error: checkinsError } = await supabaseAdmin
            .from("daily_checkins")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (checkinsError) {
            console.error("Get checkins error:", checkinsError)
            return res.status(500).json({ success: false, error: "Failed to get checkins" })
        }

        return res.status(200).json({ success: true, data: { checkins: checkins || [] } })
    } catch (err) {
        console.error("Error getting checkins:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
