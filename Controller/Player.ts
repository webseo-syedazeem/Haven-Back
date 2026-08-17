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

const validateNonNegativeInteger = (field: string, value: unknown, nullable: boolean) => {
    if (value === null && nullable) {
        return { value: null as number | null }
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return { value: null, error: `${field} must be a non-negative integer${nullable ? " or null" : ""}` }
    }

    return { value }
}

const validateQueue = (value: unknown): { value: string[]; error?: string } => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return { value: [], error: "queue must be an array of soundscape ids" }
    }

    return { value: value.map((item) => item.trim()).filter(Boolean) }
}

export const UpsertPlayerState = async (req: Request, res: Response) => {
    const body = req.body || {}
    const soundscapeId = String(body.soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    const position = validateNonNegativeInteger("position_seconds", body.position_seconds, false)
    if (position.error) {
        return res.status(400).json({ success: false, error: position.error })
    }

    const updates: Record<string, unknown> = {
        position_seconds: position.value,
    }

    if (Object.prototype.hasOwnProperty.call(body, "duration_seconds")) {
        const duration = validateNonNegativeInteger("duration_seconds", body.duration_seconds, true)
        if (duration.error) {
            return res.status(400).json({ success: false, error: duration.error })
        }
        updates.duration_seconds = duration.value
    }

    if (Object.prototype.hasOwnProperty.call(body, "queue")) {
        const queue = validateQueue(body.queue)
        if (queue.error) {
            return res.status(400).json({ success: false, error: queue.error })
        }
        updates.queue = queue.value
    }

    if (Object.prototype.hasOwnProperty.call(body, "timer_minutes")) {
        const timer = validateNonNegativeInteger("timer_minutes", body.timer_minutes, true)
        if (timer.error) {
            return res.status(400).json({ success: false, error: timer.error })
        }
        updates.timer_minutes = timer.value
    }

    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Upsert player state profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: soundscape, error: soundscapeError } = await getLiveSoundscape(soundscapeId)

        if (soundscapeError) {
            console.error("Upsert player state soundscape lookup error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to check soundscape" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found or not live" })
        }

        const { data: playerState, error: playerStateError } = await supabaseAdmin
            .from("user_player_state")
            .upsert({
                ...updates,
                user_id: userProfile.id,
                soundscape_id: soundscapeId,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single()

        if (playerStateError) {
            console.error("Upsert player state error:", playerStateError)
            return res.status(500).json({ success: false, error: "Failed to save player state" })
        }

        return res.status(200).json({ success: true, data: { player_state: playerState } })
    } catch (err) {
        console.error("Error saving player state:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetPlayerState = async (req: Request, res: Response) => {
    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Get player state profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: playerState, error: playerStateError } = await supabaseAdmin
            .from("user_player_state")
            .select("*")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (playerStateError) {
            console.error("Get player state error:", playerStateError)
            return res.status(500).json({ success: false, error: "Failed to get player state" })
        }

        return res.status(200).json({ success: true, data: { player_state: playerState || null } })
    } catch (err) {
        console.error("Error getting player state:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
