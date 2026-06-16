import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

// ─── Fixed 6 tasks — hardcoded per brief ────────────────────────────────────

const ALL_TASKS = [
    {
        name: "Morning Sunlight",
        description: "Morning light helps regulate cortisol rhythm and support better sleep later",
        duration: "10 min",
        icon: "sun",
    },
    {
        name: "Breathwork",
        description: "Boost mood and regulate your nervous system",
        duration: "20 min",
        icon: "breath",
    },
    {
        name: "Movement",
        description: "Boost mood and regulate your body",
        duration: "5 min",
        icon: "movement",
    },
    {
        name: "Hydration",
        description: "Boost mood and regulate your body",
        duration: "2 glasses",
        icon: "drop",
    },
    {
        name: "Deep Work",
        description: "Focused work session to build momentum",
        duration: "3 tasks",
        icon: "focus",
    },
    {
        name: "Wind-down",
        description: "Reduce screen time and prepare your mind for rest",
        duration: "30 min",
        icon: "moon",
    },
]

const VALID_TASK_NAMES = ALL_TASKS.map((t) => t.name)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const buildTaskList = (completedTasks: string[]) => {
    return ALL_TASKS.map((task) => ({
        ...task,
        completed: completedTasks.includes(task.name),
    }))
}

// ─── GET /api/checklist/today ─────────────────────────────────────────────────
// Returns all 6 fixed tasks with completed true/false
// If no row exists yet for today → all tasks are uncompleted

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
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        // deactivate old rows
        await supabaseAdmin
            .from("user_checklists")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .lt("date", today)
            .eq("is_active", true)

        const { data: checklist, error: checklistError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (checklistError) {
            return res.status(500).json({ success: false, error: "Failed to get today checklist" })
        }

        const completedTasks: string[] = checklist?.completed_tasks ?? []
        const tasks = buildTaskList(completedTasks)
        const completedCount = completedTasks.length
        const percentage = Math.round((completedCount / VALID_TASK_NAMES.length) * 100)

        return res.status(200).json({
            success: true,
            data: {
                checklist_id: checklist?.id ?? null,
                date: today,
                tasks,
                completed_count: completedCount,
                total: VALID_TASK_NAMES.length,
                percentage,
            },
        })
    } catch (err) {
        console.error("Error getting today checklist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

// ─── PATCH /api/checklist/task ────────────────────────────────────────────────
// User taps one task → toggle completed true/false
// Auto-creates today's row if it doesn't exist yet

export const ToggleTask = async (req: Request, res: Response) => {
    const { task, completed } = req.body || {}
    const today = getTodayDate()

    const cleanTask = String(task || "").trim()

    if (!VALID_TASK_NAMES.includes(cleanTask)) {
        return res.status(400).json({
            success: false,
            error: `Invalid task. Valid tasks: ${VALID_TASK_NAMES.join(", ")}`,
        })
    }

    if (typeof completed !== "boolean") {
        return res.status(400).json({
            success: false,
            error: "completed must be a boolean (true or false)",
        })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        // get or create today's checklist row
        let { data: checklist, error: fetchError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (fetchError) {
            return res.status(500).json({ success: false, error: "Failed to fetch checklist" })
        }

        let currentCompleted: string[] = checklist?.completed_tasks ?? []

        // toggle the task
        if (completed) {
            // add if not already in list
            if (!currentCompleted.includes(cleanTask)) {
                currentCompleted = [...currentCompleted, cleanTask]
            }
        } else {
            // remove from list
            currentCompleted = currentCompleted.filter((t) => t !== cleanTask)
        }

        const percentage = Math.round((currentCompleted.length / VALID_TASK_NAMES.length) * 100)

        if (!checklist) {
            // create new row for today
            const { data: newChecklist, error: insertError } = await supabaseAdmin
                .from("user_checklists")
                .insert({
                    user_id: userProfile.id,
                    completed_tasks: currentCompleted,
                    percentage,
                    is_active: true,
                    date: today,
                })
                .select("*")
                .single()

            if (insertError) {
                return res.status(500).json({ success: false, error: "Failed to create checklist" })
            }

            checklist = newChecklist
        } else {
            // update existing row
            const { data: updatedChecklist, error: updateError } = await supabaseAdmin
                .from("user_checklists")
                .update({
                    completed_tasks: currentCompleted,
                    percentage,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", checklist.id)
                .eq("user_id", userProfile.id)
                .select("*")
                .single()

            if (updateError) {
                return res.status(500).json({ success: false, error: "Failed to update checklist" })
            }

            checklist = updatedChecklist
        }

        const tasks = buildTaskList(currentCompleted)

        return res.status(200).json({
            success: true,
            data: {
                checklist_id: checklist.id,
                date: today,
                tasks,
                completed_count: currentCompleted.length,
                total: VALID_TASK_NAMES.length,
                percentage,
            },
        })
    } catch (err) {
        console.error("Error toggling task:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

// ─── GET /api/checklist ───────────────────────────────────────────────────────
// History — all past checklists with task breakdown

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
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        await supabaseAdmin
            .from("user_checklists")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .lt("date", today)
            .eq("is_active", true)

        const { data: checklists, error: checklistsError } = await supabaseAdmin
            .from("user_checklists")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("date", { ascending: false })

        if (checklistsError) {
            return res.status(500).json({ success: false, error: "Failed to get checklists" })
        }

        const formatted = (checklists || []).map((c) => ({
            id: c.id,
            date: c.date,
            tasks: buildTaskList(c.completed_tasks ?? []),
            completed_count: (c.completed_tasks ?? []).length,
            total: VALID_TASK_NAMES.length,
            percentage: c.percentage,
            is_active: c.is_active,
        }))

        return res.status(200).json({ success: true, data: { checklists: formatted } })
    } catch (err) {
        console.error("Error getting checklists:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}