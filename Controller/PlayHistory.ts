import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const getUserProfileId = async (authUserId: string) => {
    return supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single()
}

const getLiveSoundscape = async (soundscapeId: string) => {
    return supabaseAdmin
        .from("soundscapes")
        .select("id")
        .eq("id", soundscapeId)
        .eq("status", "live")
        .maybeSingle()
}

const validateNonNegativeInteger = (field: string, value: unknown) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return { value: null, error: `${field} must be a non-negative integer` }
    }

    return { value }
}

export const AddPlayHistory = async (req: Request, res: Response) => {
    const body = req.body || {}
    const soundscapeId = String(body.soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    const historyFields: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, "position_seconds")) {
        const positionSeconds = validateNonNegativeInteger("position_seconds", body.position_seconds)
        if (positionSeconds.error) {
            return res.status(400).json({ success: false, error: positionSeconds.error })
        }
        historyFields.position_seconds = positionSeconds.value
    }

    if (Object.prototype.hasOwnProperty.call(body, "completed")) {
        if (typeof body.completed !== "boolean") {
            return res.status(400).json({ success: false, error: "completed must be a boolean" })
        }
        historyFields.completed = body.completed
    }

    if (Object.prototype.hasOwnProperty.call(body, "listened_seconds")) {
        const listenedSeconds = validateNonNegativeInteger("listened_seconds", body.listened_seconds)
        if (listenedSeconds.error) {
            return res.status(400).json({ success: false, error: listenedSeconds.error })
        }
        historyFields.listened_seconds = listenedSeconds.value
    }

    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfileId(user.id)

        if (profileError || !userProfile) {
            console.error("Add play history profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: soundscape, error: soundscapeError } = await getLiveSoundscape(soundscapeId)

        if (soundscapeError) {
            console.error("Add play history soundscape lookup error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to check soundscape" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found or not live" })
        }

        const { data: historyEntry, error: historyError } = await supabaseAdmin
            .from("user_play_history")
            .insert({
                user_id: userProfile.id,
                soundscape_id: soundscapeId,
                ...historyFields,
            })
            .select("*")
            .single()

        if (historyError) {
            console.error("Add play history error:", historyError)
            return res.status(500).json({ success: false, error: "Failed to record play history" })
        }

        return res.status(200).json({
            success: true,
            data: { play_history: historyEntry },
        })
    } catch (err) {
        console.error("Error adding play history:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetPlayHistory = async (req: Request, res: Response) => {
    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfileId(user.id)

        if (profileError || !userProfile) {
            console.error("Get play history profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: playHistory, error: historyError } = await supabaseAdmin
            .from("user_play_history")
            .select("id, user_id, soundscape_id, played_at, soundscape:soundscapes!inner(*)")
            .eq("user_id", userProfile.id)
            .eq("soundscape.status", "live")
            .order("played_at", { ascending: false })
            .limit(50)

        if (historyError) {
            console.error("Get play history error:", historyError)
            return res.status(500).json({ success: false, error: "Failed to get play history" })
        }

        return res.status(200).json({
            success: true,
            data: { play_history: playHistory || [] },
        })
    } catch (err) {
        console.error("Error getting play history:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
