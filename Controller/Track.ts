import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_SLEEP_QUALITY = [
    "Restful",
    "Light sleep",
    "Waking often",
    "Hard to fall asleep",
    "Very tired",
]

const getTodayDate = () => {
    return new Date().toISOString().slice(0, 10)
}

const validateTrackInput = (body: Record<string, unknown>) => {
    const { sleep_quality, notes, glimmers } = body
    const payload: Record<string, unknown> = {}

    if (sleep_quality !== undefined && sleep_quality !== null && String(sleep_quality).trim()) {
        const cleanSleepQuality = String(sleep_quality).trim()

        if (!VALID_SLEEP_QUALITY.includes(cleanSleepQuality)) {
            return { valid: false, error: `Invalid sleep_quality: ${cleanSleepQuality}`, payload }
        }

        payload.sleep_quality = cleanSleepQuality
    }

    if (notes !== undefined) {
        if (notes !== null && typeof notes !== "string") {
            return { valid: false, error: "notes must be a string", payload }
        }

        payload.notes = notes === null ? null : String(notes).trim()
    }

    if (glimmers !== undefined) {
        if (glimmers !== null && !Array.isArray(glimmers)) {
            return { valid: false, error: "glimmers must be an array of strings", payload }
        }

        payload.glimmers = glimmers === null ? null : (glimmers as unknown[]).map((glimmer) => String(glimmer || "").trim())
    }

    return { valid: true, error: null, payload }
}

const deactivateOldTracks = async (userId: number, today: string) => {
    return supabaseAdmin
        .from("user_tracks")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .lt("date", today)
        .eq("is_active", true)
}

export const SaveTrack = async (req: Request, res: Response) => {
    const today = getTodayDate()
    const validation = validateTrackInput(req.body || {})

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
            console.error("Save track profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingTrack, error: existingTrackError } = await supabaseAdmin
            .from("user_tracks")
            .select("id")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (existingTrackError) {
            console.error("Check existing track error:", existingTrackError)
            return res.status(500).json({ success: false, error: "Failed to check existing track" })
        }

        if (existingTrack) {
            return res.status(400).json({
                success: false,
                error: "Track already saved for today. Use PUT to update.",
            })
        }

        const { data: savedTrack, error: trackError } = await supabaseAdmin
            .from("user_tracks")
            .insert({
                user_id: userProfile.id,
                ...validation.payload,
                date: today,
                is_active: true,
            })
            .select("*")
            .single()

        if (trackError) {
            console.error("Save track error:", trackError)
            return res.status(500).json({ success: false, error: "Failed to save track" })
        }

        return res.status(200).json({ success: true, data: { track: savedTrack } })
    } catch (err) {
        console.error("Error saving track:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateTrack = async (req: Request, res: Response) => {
    const today = getTodayDate()
    const { id } = req.params
    const trackId = String(id)
    const validation = validateTrackInput(req.body || {})

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
            console.error("Update track profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { error: deactivateError } = await deactivateOldTracks(userProfile.id, today)

        if (deactivateError) {
            console.error("Deactivate old tracks error:", deactivateError)
            return res.status(500).json({ success: false, error: "Failed to update track status" })
        }

        const { data: existingTrack, error: existingTrackError } = await supabaseAdmin
            .from("user_tracks")
            .select("*")
            .eq("id", trackId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingTrackError) {
            console.error("Get track for update error:", existingTrackError)
            return res.status(500).json({ success: false, error: "Failed to get track" })
        }

        if (!existingTrack) {
            return res.status(404).json({ success: false, error: "Track not found" })
        }

        if (existingTrack.is_active === false) {
            return res.status(400).json({
                success: false,
                error: "This track is no longer active. You can only update today's track.",
            })
        }

        const { data: updatedTrack, error: updateTrackError } = await supabaseAdmin
            .from("user_tracks")
            .update({
                ...validation.payload,
                updated_at: new Date().toISOString(),
            })
            .eq("id", trackId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (updateTrackError) {
            console.error("Update track error:", updateTrackError)
            return res.status(500).json({ success: false, error: "Failed to update track" })
        }

        if (!updatedTrack) {
            return res.status(404).json({ success: false, error: "Track not found" })
        }

        return res.status(200).json({ success: true, data: { track: updatedTrack } })
    } catch (err) {
        console.error("Error updating track:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAllTracks = async (req: Request, res: Response) => {
    const today = getTodayDate()

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get tracks profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { error: deactivateError } = await deactivateOldTracks(userProfile.id, today)

        if (deactivateError) {
            console.error("Deactivate old tracks error:", deactivateError)
            return res.status(500).json({ success: false, error: "Failed to update track status" })
        }

        const { data: tracks, error: tracksError } = await supabaseAdmin
            .from("user_tracks")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("date", { ascending: false })

        if (tracksError) {
            console.error("Get tracks error:", tracksError)
            return res.status(500).json({ success: false, error: "Failed to get tracks" })
        }

        return res.status(200).json({ success: true, data: { tracks: tracks || [] } })
    } catch (err) {
        console.error("Error getting tracks:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetTodayTrack = async (req: Request, res: Response) => {
    const today = getTodayDate()

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get today track profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { error: deactivateError } = await deactivateOldTracks(userProfile.id, today)

        if (deactivateError) {
            console.error("Deactivate old tracks error:", deactivateError)
            return res.status(500).json({ success: false, error: "Failed to update track status" })
        }

        const { data: track, error: trackError } = await supabaseAdmin
            .from("user_tracks")
            .select("*")
            .eq("user_id", userProfile.id)
            .eq("date", today)
            .maybeSingle()

        if (trackError) {
            console.error("Get today track error:", trackError)
            return res.status(500).json({ success: false, error: "Failed to get today track" })
        }

        return res.status(200).json({ success: true, data: { track: track || null } })
    } catch (err) {
        console.error("Error getting today track:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
