import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_TASKS = [
    "Morning Sunlight",
    "Breathwork",
    "Movement",
    "Hydration",
    "Deep Work",
    "Wind-down",
]

const getTodayDate = () => {
    return new Date().toISOString().slice(0, 10)
}

const validateCompletedTasks = (completedTasks: unknown) => {
    if (!Array.isArray(completedTasks)) {
        return { valid: false, error: "completed_tasks must be an array" }
    }

    for (const task of completedTasks) {
        if (!VALID_TASKS.includes(String(task))) {
            return { valid: false, error: `Invalid task: ${String(task)}` }
        }
    }

    return { valid: true, tasks: completedTasks.map((task) => String(task)) }
}

export const SaveChecklist = async (req: Request, res: Response) => {
    const { completed_tasks } = req.body || {}
    const today = getTodayDate()

    const validation = validateCompletedTasks(completed_tasks)

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
            console.error("Save checklist profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingChecklist, error: existingChecklistError } = await supabaseAdmin
            .from("user_checklists")
            .select("id")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (existingChecklistError) {
            console.error("Check existing checklist error:", existingChecklistError)
            return res.status(500).json({ success: false, error: "Failed to check existing checklist" })
        }

        if (existingChecklist) {
            return res.status(400).json({
                success: false,
                error: "Checklist already submitted for today. You can update it using PUT.",
            })
        }

        const completedTasks = validation.tasks || []
        const percentage = (completedTasks.length / VALID_TASKS.length) * 100

        const { data: savedChecklist, error: checklistError } = await supabaseAdmin
            .from("user_checklists")
            .insert({
                user_id: userProfile.id,
                completed_tasks: completedTasks,
                percentage,
                is_active: true,
                date: today,
            })
            .select("*")
            .single()

        if (checklistError) {
            console.error("Save checklist error:", checklistError)
            return res.status(500).json({ success: false, error: "Failed to save checklist" })
        }

        return res.status(200).json({ success: true, data: { checklist: savedChecklist } })
    } catch (err) {
        console.error("Error saving checklist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateChecklist = async (req: Request, res: Response) => {
    const { completed_tasks } = req.body || {}
    const { id } = req.params
    const checklistId = String(id)

    const validation = validateCompletedTasks(completed_tasks)

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
            console.error("Update checklist profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingChecklist, error: existingChecklistError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("id", checklistId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingChecklistError) {
            console.error("Get checklist for update error:", existingChecklistError)
            return res.status(500).json({ success: false, error: "Failed to get checklist" })
        }

        if (!existingChecklist) {
            return res.status(404).json({ success: false, error: "Checklist not found" })
        }

        if (existingChecklist.is_active === false) {
            return res.status(400).json({
                success: false,
                error: "This checklist is no longer active. You can only update today's checklist.",
            })
        }

        const completedTasks = validation.tasks || []
        const percentage = (completedTasks.length / VALID_TASKS.length) * 100

        const { data: updatedChecklist, error: updateChecklistError } = await supabaseAdmin
            .from("user_checklists")
            .update({
                completed_tasks: completedTasks,
                percentage,
                updated_at: new Date().toISOString(),
            })
            .eq("id", checklistId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (updateChecklistError) {
            console.error("Update checklist error:", updateChecklistError)
            return res.status(500).json({ success: false, error: "Failed to update checklist" })
        }

        if (!updatedChecklist) {
            return res.status(404).json({ success: false, error: "Checklist not found" })
        }

        return res.status(200).json({ success: true, data: { checklist: updatedChecklist } })
    } catch (err) {
        console.error("Error updating checklist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAllChecklists = async (req: Request, res: Response) => {
    const today = getTodayDate()

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get checklists profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { error: deactivateError } = await supabaseAdmin
            .from("user_checklists")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .lt("date", today)
            .eq("is_active", true)

        if (deactivateError) {
            console.error("Deactivate old checklists error:", deactivateError)
            return res.status(500).json({ success: false, error: "Failed to update checklist status" })
        }

        const { data: checklists, error: checklistsError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("date", { ascending: false })

        if (checklistsError) {
            console.error("Get checklists error:", checklistsError)
            return res.status(500).json({ success: false, error: "Failed to get checklists" })
        }

        return res.status(200).json({ success: true, data: { checklists: checklists || [] } })
    } catch (err) {
        console.error("Error getting checklists:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetTodayChecklist = async (req: Request, res: Response) => {
    const today = getTodayDate()

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get today checklist profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { error: deactivateError } = await supabaseAdmin
            .from("user_checklists")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .lt("date", today)
            .eq("is_active", true)

        if (deactivateError) {
            console.error("Deactivate old checklists error:", deactivateError)
            return res.status(500).json({ success: false, error: "Failed to update checklist status" })
        }

        const { data: checklist, error: checklistError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (checklistError) {
            console.error("Get today checklist error:", checklistError)
            return res.status(500).json({ success: false, error: "Failed to get today checklist" })
        }

        return res.status(200).json({ success: true, data: { checklist: checklist || null } })
    } catch (err) {
        console.error("Error getting today checklist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
