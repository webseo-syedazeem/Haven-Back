import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_MOODS = ["Calm", "Tense", "Anxious", "Overwhelmed", "Low", "Energised"]

export const SaveMood = async (req: Request, res: Response) => {
    const { mood } = req.body || {}

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Save mood profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

        const { data: recentMoods, error: recentMoodError } = await supabaseAdmin
            .from("user_moods")
            .select("id")
            .eq("user_id", userProfile.id)
            .gte("created_at", sixHoursAgo)
            .limit(1)

        if (recentMoodError) {
            console.error("Check recent mood error:", recentMoodError)
            return res.status(500).json({ success: false, error: "Failed to check recent mood" })
        }

        if (recentMoods && recentMoods.length > 0) {
            return res.status(400).json({ success: false, error: "You can only log your mood once every 6 hours" })
        }

        const cleanMood = String(mood || "").trim()

        if (!VALID_MOODS.includes(cleanMood)) {
            return res.status(400).json({ success: false, error: `Invalid mood: ${cleanMood}` })
        }

        const { data: savedMood, error: moodError } = await supabaseAdmin
            .from("user_moods")
            .insert({
                user_id: userProfile.id,
                mood: cleanMood,
            })
            .select("*")
            .single()

        if (moodError) {
            console.error("Save mood error:", moodError)
            return res.status(500).json({ success: false, error: "Failed to save mood" })
        }

        return res.status(200).json({ success: true, data: { mood: savedMood } })
    } catch (err) {
        console.error("Error saving mood:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAllMoods = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get moods profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: moods, error: moodsError } = await supabaseAdmin
            .from("user_moods")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (moodsError) {
            console.error("Get moods error:", moodsError)
            return res.status(500).json({ success: false, error: "Failed to get moods" })
        }

        return res.status(200).json({ success: true, data: { moods: moods || [] } })
    } catch (err) {
        console.error("Error getting moods:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetLatestMood = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get latest mood profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: latestMood, error: latestMoodError } = await supabaseAdmin
            .from("user_moods")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (latestMoodError) {
            console.error("Get latest mood error:", latestMoodError)
            return res.status(500).json({ success: false, error: "Failed to get latest mood" })
        }

        return res.status(200).json({ success: true, data: { mood: latestMood || null } })
    } catch (err) {
        console.error("Error getting latest mood:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateMood = async (req: Request, res: Response) => {
    const { mood } = req.body || {}
    const { id } = req.params
    const moodId = String(id)

    const cleanMood = String(mood || "").trim()

    if (!VALID_MOODS.includes(cleanMood)) {
        return res.status(400).json({ success: false, error: `Invalid mood: ${cleanMood}` })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update mood profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: updatedMood, error: updateMoodError } = await supabaseAdmin
            .from("user_moods")
            .update({ mood: cleanMood, updated_at: new Date().toISOString() })
            .eq("id", moodId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (updateMoodError) {
            console.error("Update mood error:", updateMoodError)
            return res.status(500).json({ success: false, error: "Failed to update mood" })
        }

        if (!updatedMood) {
            return res.status(404).json({ success: false, error: "Mood not found" })
        }

        return res.status(200).json({ success: true, data: { mood: updatedMood } })
    } catch (err) {
        console.error("Error updating mood:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
