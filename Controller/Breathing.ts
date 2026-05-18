import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const BREATHING_TYPES = {
    "Box Breathing": {
        total_duration_seconds: 304,
        inhale: 4,
        hold1: 4,
        exhale: 4,
        hold2: 4,
    },
    "4-7-8 Sleep Reset": {
        total_duration_seconds: 247,
        inhale: 4,
        hold1: 7,
        exhale: 8,
        hold2: 0,
    },
    "Physiological Sigh": {
        total_duration_seconds: 126,
        inhale: 4,
        hold1: 2,
        exhale: 8,
        hold2: 0,
    },
    "Resonant Breathing": {
        total_duration_seconds: 360,
        inhale: 5,
        hold1: 0,
        exhale: 5,
        hold2: 0,
    },
    "Focus Reset": {
        total_duration_seconds: 182,
        inhale: 4,
        hold1: 4,
        exhale: 6,
        hold2: 0,
    },
    "Morning Lift": {
        total_duration_seconds: 240,
        inhale: 4,
        hold1: 0,
        exhale: 4,
        hold2: 0,
    },
}

type BreathingType = keyof typeof BREATHING_TYPES

const isBreathingType = (type: string): type is BreathingType => {
    return Object.keys(BREATHING_TYPES).includes(type)
}

const getSessionWithBreathingDetails = (session: Record<string, unknown>) => {
    const sessionType = String(session.type || "")

    if (!isBreathingType(sessionType)) {
        return session
    }

    const completedDurationSeconds = typeof session.completed_duration_seconds === "number"
        ? session.completed_duration_seconds
        : 0
    const phaseCompletion = getPhaseCompletion(
        completedDurationSeconds,
        sessionType,
        Number(session.total_duration_seconds)
    )

    return {
        ...session,
        completed_duration_seconds: session.completed_duration_seconds,
        completed: Boolean(session.completed),
        completed_cycles: phaseCompletion.completed_cycles,
        total_cycles: phaseCompletion.total_cycles,
        cycle_duration_seconds: phaseCompletion.cycle_duration_seconds,
        cycles_data: Array.isArray(session.cycles_data) ? session.cycles_data : phaseCompletion.cycles,
        ...BREATHING_TYPES[sessionType],
    }
}

const getPhaseCompletion = (
    completedDurationSeconds: number,
    type: BreathingType,
    totalDurationSeconds: number
) => {
    const breathingType = BREATHING_TYPES[type]
    const cycleDuration = breathingType.inhale + breathingType.hold1 + breathingType.exhale + breathingType.hold2
    const totalCycles = Math.ceil(totalDurationSeconds / cycleDuration)
    const completedCycles = Math.floor(completedDurationSeconds / cycleDuration)
    const cycles = []

    for (let index = 0; index < totalCycles; index++) {
        const cycleStart = index * cycleDuration
        const isFullyCompleted = completedDurationSeconds >= cycleStart + cycleDuration
        const remainingInCycle = completedDurationSeconds - cycleStart

        if (isFullyCompleted) {
            cycles.push({
                cycle_number: index + 1,
                inhale: true,
                hold1: true,
                exhale: true,
                hold2: true,
            })
        } else if (remainingInCycle > 0) {
            cycles.push({
                cycle_number: index + 1,
                inhale: remainingInCycle >= breathingType.inhale,
                hold1: breathingType.hold1 === 0 || remainingInCycle >= breathingType.inhale + breathingType.hold1,
                exhale: remainingInCycle >= breathingType.inhale + breathingType.hold1 + breathingType.exhale,
                hold2: breathingType.hold2 === 0 || remainingInCycle >= breathingType.inhale + breathingType.hold1 + breathingType.exhale + breathingType.hold2,
            })
        } else {
            cycles.push({
                cycle_number: index + 1,
                inhale: false,
                hold1: breathingType.hold1 === 0,
                exhale: false,
                hold2: breathingType.hold2 === 0,
            })
        }
    }

    return {
        completed: completedDurationSeconds >= totalDurationSeconds,
        completed_cycles: completedCycles,
        total_cycles: totalCycles,
        cycle_duration_seconds: cycleDuration,
        completed_duration_seconds: completedDurationSeconds,
        cycles,
    }
}

export const StartSession = async (req: Request, res: Response) => {
    const { type } = req.body || {}
    const cleanType = String(type || "").trim()

    if (!isBreathingType(cleanType)) {
        return res.status(400).json({ success: false, error: `Invalid breathing type: ${cleanType}` })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Start breathing session profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const breathingType = BREATHING_TYPES[cleanType]

        const { data: session, error: sessionError } = await supabaseAdmin
            .from("user_breathing_sessions")
            .insert({
                user_id: userProfile.id,
                type: cleanType,
                total_duration_seconds: breathingType.total_duration_seconds,
                completed_duration_seconds: null,
                completed: false,
                cycles_data: [],
            })
            .select("*")
            .single()

        if (sessionError) {
            console.error("Start breathing session error:", sessionError)
            return res.status(500).json({ success: false, error: "Failed to start breathing session" })
        }

        return res.status(200).json({ success: true, data: { session: getSessionWithBreathingDetails(session) } })
    } catch (err) {
        console.error("Error starting breathing session:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateSession = async (req: Request, res: Response) => {
    const { completed_duration_seconds } = req.body || {}
    const { id } = req.params
    const sessionId = String(id)

    if (typeof completed_duration_seconds !== "number" || completed_duration_seconds < 0) {
        return res.status(400).json({ success: false, error: "completed_duration_seconds must be a non-negative number" })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update breathing session profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingSession, error: existingSessionError } = await supabaseAdmin
            .from("user_breathing_sessions")
            .select("*")
            .eq("id", sessionId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingSessionError) {
            console.error("Get breathing session for update error:", existingSessionError)
            return res.status(500).json({ success: false, error: "Failed to get breathing session" })
        }

        if (!existingSession) {
            return res.status(404).json({ success: false, error: "Breathing session not found" })
        }

        const sessionType = String(existingSession.type || "")

        if (!isBreathingType(sessionType)) {
            return res.status(500).json({ success: false, error: "Invalid breathing session type" })
        }

        const phaseCompletion = getPhaseCompletion(
            completed_duration_seconds,
            sessionType,
            Number(existingSession.total_duration_seconds)
        )

        const { data: updatedSession, error: updateSessionError } = await supabaseAdmin
            .from("user_breathing_sessions")
            .update({
                completed_duration_seconds,
                completed: phaseCompletion.completed,
                cycles_data: phaseCompletion.cycles,
                updated_at: new Date().toISOString(),
            })
            .eq("id", sessionId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (updateSessionError) {
            console.error("Update breathing session error:", updateSessionError)
            return res.status(500).json({ success: false, error: "Failed to update breathing session" })
        }

        if (!updatedSession) {
            return res.status(404).json({ success: false, error: "Breathing session not found" })
        }

        return res.status(200).json({ success: true, data: { session: getSessionWithBreathingDetails(updatedSession) } })
    } catch (err) {
        console.error("Error updating breathing session:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAllSessions = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get breathing sessions profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: sessions, error: sessionsError } = await supabaseAdmin
            .from("user_breathing_sessions")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (sessionsError) {
            console.error("Get breathing sessions error:", sessionsError)
            return res.status(500).json({ success: false, error: "Failed to get breathing sessions" })
        }

        return res.status(200).json({
            success: true,
            data: {
                sessions: (sessions || []).map((session) => getSessionWithBreathingDetails(session)),
            },
        })
    } catch (err) {
        console.error("Error getting breathing sessions:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneSession = async (req: Request, res: Response) => {
    const { id } = req.params
    const sessionId = String(id)

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get breathing session profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: session, error: sessionError } = await supabaseAdmin
            .from("user_breathing_sessions")
            .select("*")
            .eq("id", sessionId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (sessionError) {
            console.error("Get breathing session error:", sessionError)
            return res.status(500).json({ success: false, error: "Failed to get breathing session" })
        }

        if (!session) {
            return res.status(404).json({ success: false, error: "Breathing session not found" })
        }

        return res.status(200).json({ success: true, data: { session: getSessionWithBreathingDetails(session) } })
    } catch (err) {
        console.error("Error getting breathing session:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
