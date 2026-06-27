import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_GOALS = [
    "Feel calmer fast",
    "Sleep better",
    "Focus more",
    "Build habits",
    "Stop spiralling",
    "Recover after work",
]

const validateGoals = (goals: unknown) => {
    if (!Array.isArray(goals)) {
        return { valid: false, goals: [] as string[], error: "Goals must be an array" }
    }

    const cleanGoals = goals.map((goal) => String(goal || "").trim())
    const invalidGoal = cleanGoals.find((goal) => !VALID_GOALS.includes(goal))

    if (invalidGoal) {
        return { valid: false, goals: cleanGoals, error: `Invalid goal: ${invalidGoal}` }
    }

    return { valid: true, goals: cleanGoals, error: null }
}

export const SaveGoals = async (req: Request, res: Response) => {
    const { goals } = req.body || {}
    const validation = validateGoals(goals)

    if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Save goals profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingGoals, error: existingGoalsError } = await supabaseAdmin
            .from("user_goals")
            .select("id")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingGoalsError) {
            console.error("Check existing goals error:", existingGoalsError)
            return res.status(500).json({ success: false, error: "Failed to check goals" })
        }

        if (existingGoals) {
            return res.status(400).json({ success: false, error: "Goals already saved. Use PUT to update." })
        }

        const { data: savedGoals, error: goalsError } = await supabaseAdmin
            .from("user_goals")
            .insert({
                user_id: userProfile.id,
                goals: validation.goals,
            })
            .select("*")
            .single()

        if (goalsError) {
            console.error("Save goals error:", goalsError)
            return res.status(500).json({ success: false, error: "Failed to save goals" })
        }

        return res.status(200).json({ success: true, data: { goals: savedGoals } })
    } catch (err) {
        console.error("Error saving goals:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateGoals = async (req: Request, res: Response) => {
    const { goals } = req.body || {}
    const validation = validateGoals(goals)

    if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.error })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update goals profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingGoals, error: existingGoalsError } = await supabaseAdmin
            .from("user_goals")
            .select("id")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingGoalsError) {
            console.error("Find goals error:", existingGoalsError)
            return res.status(500).json({ success: false, error: "Failed to find goals" })
        }

        if (!existingGoals) {
            return res.status(404).json({ success: false, error: "Goals not found" })
        }

        const { data: updatedGoals, error: updateGoalsError } = await supabaseAdmin
            .from("user_goals")
            .update({ goals: validation.goals, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .select("*")
            .single()

        if (updateGoalsError) {
            console.error("Update goals error:", updateGoalsError)
            return res.status(500).json({ success: false, error: "Failed to update goals" })
        }

        return res.status(200).json({ success: true, data: { goals: updatedGoals } })
    } catch (err) {
        console.error("Error updating goals:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetGoals = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get goals profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: goals, error: goalsError } = await supabaseAdmin
            .from("user_goals")
            .select("*")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (goalsError) {
            console.error("Get goals error:", goalsError)
            return res.status(500).json({ success: false, error: "Failed to get goals" })
        }

        return res.status(200).json({ success: true, data: { goals: goals || null } })
    } catch (err) {
        console.error("Error getting goals:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
