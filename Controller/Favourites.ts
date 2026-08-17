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

export const AddFavourite = async (req: Request, res: Response) => {
    const soundscapeId = String(req.body?.soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfileId(user.id)

        if (profileError || !userProfile) {
            console.error("Add favourite profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: soundscape, error: soundscapeError } = await getLiveSoundscape(soundscapeId)

        if (soundscapeError) {
            console.error("Add favourite soundscape lookup error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to check soundscape" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found or not live" })
        }

        const { data: existingFavourite, error: existingFavouriteError } = await supabaseAdmin
            .from("user_favourites")
            .select("id")
            .eq("user_id", userProfile.id)
            .eq("soundscape_id", soundscapeId)
            .maybeSingle()

        if (existingFavouriteError) {
            console.error("Check existing favourite error:", existingFavouriteError)
            return res.status(500).json({ success: false, error: "Failed to check favourite" })
        }

        if (existingFavourite) {
            return res.status(400).json({ success: false, error: "Already favourited" })
        }

        const { data: favourite, error: favouriteError } = await supabaseAdmin
            .from("user_favourites")
            .insert({
                user_id: userProfile.id,
                soundscape_id: soundscapeId,
            })
            .select("*")
            .single()

        if (favouriteError) {
            if (favouriteError.code === "23505") {
                return res.status(400).json({ success: false, error: "Already favourited" })
            }

            console.error("Add favourite error:", favouriteError)
            return res.status(500).json({ success: false, error: "Failed to add favourite" })
        }

        return res.status(200).json({ success: true, data: { favourite } })
    } catch (err) {
        console.error("Error adding favourite:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RemoveFavourite = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.soundscapeId || "").trim()

    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfileId(user.id)

        if (profileError || !userProfile) {
            console.error("Remove favourite profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: deletedFavourite, error: deleteError } = await supabaseAdmin
            .from("user_favourites")
            .delete()
            .eq("user_id", userProfile.id)
            .eq("soundscape_id", soundscapeId)
            .select("*")
            .maybeSingle()

        if (deleteError) {
            console.error("Remove favourite error:", deleteError)
            return res.status(500).json({ success: false, error: "Failed to remove favourite" })
        }

        if (!deletedFavourite) {
            return res.status(404).json({ success: false, error: "Favourite not found" })
        }

        return res.status(200).json({
            success: true,
            data: { favourite: deletedFavourite },
        })
    } catch (err) {
        console.error("Error removing favourite:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetFavourites = async (req: Request, res: Response) => {
    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfileId(user.id)

        if (profileError || !userProfile) {
            console.error("Get favourites profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: favourites, error: favouritesError } = await supabaseAdmin
            .from("user_favourites")
            .select("id, user_id, soundscape_id, created_at, soundscape:soundscapes!inner(*)")
            .eq("user_id", userProfile.id)
            .eq("soundscape.status", "live")
            .order("created_at", { ascending: false })

        if (favouritesError) {
            console.error("Get favourites error:", favouritesError)
            return res.status(500).json({ success: false, error: "Failed to get favourites" })
        }

        return res.status(200).json({
            success: true,
            data: { favourites: favourites || [] },
        })
    } catch (err) {
        console.error("Error getting favourites:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
