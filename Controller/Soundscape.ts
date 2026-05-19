import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_PILLARS = ["calm", "sleep", "focus"]

const isValidPillar = (pillar: string) => {
    return VALID_PILLARS.includes(pillar)
}

const getUserProfile = async (authUserId: string, logPrefix: string) => {
    const { data: userProfile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single()

    if (profileError || !userProfile) {
        console.error(`${logPrefix} profile error:`, profileError)
        return null
    }

    return userProfile
}

export const GetAllSoundscapes = async (req: Request, res: Response) => {
    try {
        const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .order("pillar", { ascending: true })
            .order("title", { ascending: true })

        if (soundscapesError) {
            console.error("Get soundscapes error:", soundscapesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscapes" })
        }

        const groupedSoundscapes = {
            calm: [],
            sleep: [],
            focus: [],
        } as Record<string, unknown[]>

        for (const soundscape of soundscapes || []) {
            const pillar = String(soundscape.pillar || "")

            if (isValidPillar(pillar)) {
                groupedSoundscapes[pillar].push(soundscape)
            }
        }

        return res.status(200).json({ success: true, data: groupedSoundscapes })
    } catch (err) {
        console.error("Error getting soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetSoundscapesByPillar = async (req: Request, res: Response) => {
    const { pillar } = req.params
    const cleanPillar = String(pillar || "").trim().toLowerCase()

    if (!isValidPillar(cleanPillar)) {
        return res.status(400).json({ success: false, error: `Invalid pillar: ${cleanPillar}` })
    }

    try {
        const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("pillar", cleanPillar)
            .order("title", { ascending: true })

        if (soundscapesError) {
            console.error("Get soundscapes by pillar error:", soundscapesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscapes" })
        }

        return res.status(200).json({ success: true, data: { soundscapes: soundscapes || [] } })
    } catch (err) {
        console.error("Error getting soundscapes by pillar:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneSoundscape = async (req: Request, res: Response) => {
    const { id } = req.params
    const soundscapeId = String(id)

    try {
        const { data: soundscape, error: soundscapeError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (soundscapeError) {
            console.error("Get soundscape error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape" })
        }

        if (!soundscape) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        const { data: layers, error: layersError } = await supabaseAdmin
            .from("soundscape_layers")
            .select("*")
            .eq("soundscape_id", soundscapeId)
            .order("sort_order", { ascending: true })

        if (layersError) {
            console.error("Get soundscape layers error:", layersError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape layers" })
        }

        return res.status(200).json({ success: true, data: { soundscape, layers: layers || [] } })
    } catch (err) {
        console.error("Error getting soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SaveMix = async (req: Request, res: Response) => {
    const { soundscape_id, mix_name, layer_settings_json, timer_default } = req.body || {}
    const soundscapeId = String(soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Save soundscape mix")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: savedMix, error: mixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .insert({
                user_id: userProfile.id,
                soundscape_id: soundscapeId,
                mix_name,
                layer_settings_json,
                timer_default,
            })
            .select("*")
            .single()

        if (mixError) {
            console.error("Save soundscape mix error:", mixError)
            return res.status(500).json({ success: false, error: "Failed to save soundscape mix" })
        }

        return res.status(200).json({ success: true, data: { mix: savedMix } })
    } catch (err) {
        console.error("Error saving soundscape mix:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetUserMixes = async (req: Request, res: Response) => {
    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Get soundscape mixes")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: mixes, error: mixesError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .select("*, soundscape:soundscapes(*)")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (mixesError) {
            console.error("Get soundscape mixes error:", mixesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape mixes" })
        }

        return res.status(200).json({ success: true, data: { mixes: mixes || [] } })
    } catch (err) {
        console.error("Error getting soundscape mixes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneMix = async (req: Request, res: Response) => {
    const { id } = req.params
    const mixId = String(id)

    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Get soundscape mix")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: mix, error: mixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .select("*")
            .eq("id", mixId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (mixError) {
            console.error("Get soundscape mix error:", mixError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape mix" })
        }

        if (!mix) {
            return res.status(404).json({ success: false, error: "Soundscape mix not found" })
        }

        return res.status(200).json({ success: true, data: { mix } })
    } catch (err) {
        console.error("Error getting soundscape mix:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateMix = async (req: Request, res: Response) => {
    const { id } = req.params
    const mixId = String(id)
    const { mix_name, layer_settings_json, timer_default } = req.body || {}

    const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    if (mix_name !== undefined) {
        updateFields.mix_name = mix_name
    }

    if (layer_settings_json !== undefined) {
        updateFields.layer_settings_json = layer_settings_json
    }

    if (timer_default !== undefined) {
        updateFields.timer_default = timer_default
    }

    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Update soundscape mix")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingMix, error: existingMixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .select("id")
            .eq("id", mixId)
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingMixError) {
            console.error("Get soundscape mix for update error:", existingMixError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape mix" })
        }

        if (!existingMix) {
            return res.status(404).json({ success: false, error: "Soundscape mix not found" })
        }

        const { data: updatedMix, error: updateMixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .update(updateFields)
            .eq("id", mixId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (updateMixError) {
            console.error("Update soundscape mix error:", updateMixError)
            return res.status(500).json({ success: false, error: "Failed to update soundscape mix" })
        }

        if (!updatedMix) {
            return res.status(404).json({ success: false, error: "Soundscape mix not found" })
        }

        return res.status(200).json({ success: true, data: { mix: updatedMix } })
    } catch (err) {
        console.error("Error updating soundscape mix:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteMix = async (req: Request, res: Response) => {
    const { id } = req.params
    const mixId = String(id)

    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Delete soundscape mix")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: deletedMix, error: deleteMixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .delete()
            .eq("id", mixId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (deleteMixError) {
            console.error("Delete soundscape mix error:", deleteMixError)
            return res.status(500).json({ success: false, error: "Failed to delete soundscape mix" })
        }

        if (!deletedMix) {
            return res.status(404).json({ success: false, error: "Soundscape mix not found" })
        }

        return res.status(200).json({ success: true, data: { message: "Soundscape mix deleted successfully" } })
    } catch (err) {
        console.error("Error deleting soundscape mix:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
