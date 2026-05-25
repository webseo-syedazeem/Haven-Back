import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

type Soundscape = {
    id: string
    category?: string
    subcategory?: string
    title?: string
    file_url?: string
    [key: string]: unknown
}

type SoundscapeMix = {
    id: string
    user_id: number
    name: string
    soundscape_ids: string[] | null
    volumes: Record<string, unknown> | null
    created_at: string
    updated_at: string
    [key: string]: unknown
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const parseSoundscapeIds = (value: unknown) => {
    if (!Array.isArray(value)) {
        return null
    }

    const soundscapeIds = value.map((item) => String(item || "").trim()).filter(Boolean)
    return soundscapeIds.every((id) => UUID_REGEX.test(id)) ? soundscapeIds : null
}

const validateSoundscapeIds = (soundscapeIds: string[] | null) => {
    if (!soundscapeIds) {
        return "soundscape_ids must be an array of UUIDs"
    }

    if (soundscapeIds.length < 2 || soundscapeIds.length > 5) {
        return "soundscape_ids must have 2-5 items"
    }

    if (new Set(soundscapeIds).size !== soundscapeIds.length) {
        return "soundscape_ids must not contain duplicates"
    }

    return null
}

const getExistingSoundscapeIds = async (soundscapeIds: string[]) => {
    const { data: soundscapes, error } = await supabaseAdmin
        .from("soundscapes")
        .select("id")
        .in("id", soundscapeIds)

    if (error) {
        throw error
    }

    return new Set((soundscapes || []).map((soundscape) => String(soundscape.id)))
}

const assertSoundscapesExist = async (soundscapeIds: string[]) => {
    const existingIds = await getExistingSoundscapeIds(soundscapeIds)
    const missingIds = soundscapeIds.filter((id) => !existingIds.has(id))

    if (missingIds.length > 0) {
        return `Unknown soundscape_ids: ${missingIds.join(", ")}`
    }

    return null
}

const populateMixSoundscapes = async (mixes: SoundscapeMix[]) => {
    const ids = Array.from(new Set(mixes.flatMap((mix) => mix.soundscape_ids || [])))

    if (ids.length === 0) {
        return mixes.map((mix) => ({ ...mix, soundscapes: [] }))
    }

    const { data: soundscapes, error } = await supabaseAdmin
        .from("soundscapes")
        .select("*")
        .in("id", ids)

    if (error) {
        throw error
    }

    const soundscapeById = new Map((soundscapes || []).map((soundscape) => [String(soundscape.id), soundscape as Soundscape]))

    return mixes.map((mix) => ({
        ...mix,
        soundscapes: (mix.soundscape_ids || [])
            .map((soundscapeId) => soundscapeById.get(soundscapeId))
            .filter((soundscape): soundscape is Soundscape => Boolean(soundscape)),
    }))
}

export const GetAllSoundscapes = async (req: Request, res: Response) => {
    try {
        const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .order("category", { ascending: true })
            .order("subcategory", { ascending: true })
            .order("title", { ascending: true })

        if (soundscapesError) {
            console.error("Get soundscapes error:", soundscapesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscapes" })
        }

        const groupedSoundscapes: Record<string, Soundscape[]> = {}

        for (const soundscape of (soundscapes || []) as Soundscape[]) {
            const category = String(soundscape.category || "uncategorized")

            if (!groupedSoundscapes[category]) {
                groupedSoundscapes[category] = []
            }

            groupedSoundscapes[category].push(soundscape)
        }

        return res.status(200).json({ success: true, data: groupedSoundscapes })
    } catch (err) {
        console.error("Error getting soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetSoundscapesByCategory = async (req: Request, res: Response) => {
    const { category } = req.params
    const cleanCategory = String(category || "").trim()

    if (!cleanCategory) {
        return res.status(400).json({ success: false, error: "category is required" })
    }

    try {
        const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .ilike("category", cleanCategory)
            .order("subcategory", { ascending: true })
            .order("title", { ascending: true })

        if (soundscapesError) {
            console.error("Get soundscapes by category error:", soundscapesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscapes" })
        }

        return res.status(200).json({ success: true, data: { soundscapes: soundscapes || [] } })
    } catch (err) {
        console.error("Error getting soundscapes by category:", err)
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

        return res.status(200).json({ success: true, data: { soundscape } })
    } catch (err) {
        console.error("Error getting soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const CreateMix = async (req: Request, res: Response) => {
    const { name, soundscape_ids, volumes } = req.body || {}
    const cleanName = String(name || "").trim()
    const cleanSoundscapeIds = parseSoundscapeIds(soundscape_ids)
    const soundscapeIdsError = validateSoundscapeIds(cleanSoundscapeIds)

    if (!cleanName) {
        return res.status(400).json({ success: false, error: "name is required" })
    }

    if (soundscapeIdsError) {
        return res.status(400).json({ success: false, error: soundscapeIdsError })
    }

    if (!cleanSoundscapeIds) {
        return res.status(400).json({ success: false, error: "soundscape_ids must be an array of UUIDs" })
    }

    if (volumes !== undefined && !isPlainObject(volumes)) {
        return res.status(400).json({ success: false, error: "volumes must be an object" })
    }

    try {
        const user = req.user!
        const userProfile = await getUserProfile(user.id, "Create soundscape mix")

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const missingSoundscapesError = await assertSoundscapesExist(cleanSoundscapeIds)

        if (missingSoundscapesError) {
            return res.status(400).json({ success: false, error: missingSoundscapesError })
        }

        const { data: createdMix, error: mixError } = await supabaseAdmin
            .from("user_soundscape_mixes")
            .insert({
                user_id: userProfile.id,
                name: cleanName,
                soundscape_ids: cleanSoundscapeIds,
                volumes: isPlainObject(volumes) ? volumes : {},
            })
            .select("*")
            .single()

        if (mixError) {
            console.error("Create soundscape mix error:", mixError)
            return res.status(500).json({ success: false, error: "Failed to create soundscape mix" })
        }

        const [mix] = await populateMixSoundscapes([createdMix as SoundscapeMix])

        return res.status(201).json({ success: true, data: { mix } })
    } catch (err) {
        console.error("Error creating soundscape mix:", err)
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
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (mixesError) {
            console.error("Get soundscape mixes error:", mixesError)
            return res.status(500).json({ success: false, error: "Failed to get soundscape mixes" })
        }

        const populatedMixes = await populateMixSoundscapes((mixes || []) as SoundscapeMix[])

        return res.status(200).json({ success: true, data: { mixes: populatedMixes } })
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

        const [populatedMix] = await populateMixSoundscapes([mix as SoundscapeMix])

        return res.status(200).json({ success: true, data: { mix: populatedMix } })
    } catch (err) {
        console.error("Error getting soundscape mix:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateMix = async (req: Request, res: Response) => {
    const { id } = req.params
    const mixId = String(id)
    const { name, soundscape_ids, volumes } = req.body || {}

    const updateFields: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    let cleanSoundscapeIds: string[] | null = null

    if (name !== undefined) {
        const cleanName = String(name || "").trim()

        if (!cleanName) {
            return res.status(400).json({ success: false, error: "name cannot be empty" })
        }

        updateFields.name = cleanName
    }

    if (soundscape_ids !== undefined) {
        cleanSoundscapeIds = parseSoundscapeIds(soundscape_ids)
        const soundscapeIdsError = validateSoundscapeIds(cleanSoundscapeIds)

        if (soundscapeIdsError) {
            return res.status(400).json({ success: false, error: soundscapeIdsError })
        }

        updateFields.soundscape_ids = cleanSoundscapeIds
    }

    if (volumes !== undefined) {
        if (!isPlainObject(volumes)) {
            return res.status(400).json({ success: false, error: "volumes must be an object" })
        }

        updateFields.volumes = volumes
    }

    if (Object.keys(updateFields).length === 1) {
        return res.status(400).json({ success: false, error: "At least one field is required to update" })
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

        if (cleanSoundscapeIds) {
            const missingSoundscapesError = await assertSoundscapesExist(cleanSoundscapeIds)

            if (missingSoundscapesError) {
                return res.status(400).json({ success: false, error: missingSoundscapesError })
            }
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

        const [populatedMix] = await populateMixSoundscapes([updatedMix as SoundscapeMix])

        return res.status(200).json({ success: true, data: { mix: populatedMix } })
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
