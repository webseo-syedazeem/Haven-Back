import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_TOOL_TYPES = [
    "breathing",
    "soundscape",
    "checklist",
]

export const AddFavourite = async (req: Request, res: Response) => {
    const { tool_type, tool_id, tool_name } = req.body || {}
    const cleanToolType = String(tool_type || "").trim()
    const cleanToolId = String(tool_id || "").trim()
    const cleanToolName = String(tool_name || "").trim()

    if (!VALID_TOOL_TYPES.includes(cleanToolType)) {
        return res.status(400).json({ success: false, error: `Invalid tool_type: ${cleanToolType}` })
    }

    if (!cleanToolId || !cleanToolName) {
        return res.status(400).json({ success: false, error: "tool_id and tool_name are required" })
    }

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Add favourite profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingFavourite, error: existingFavouriteError } = await supabaseAdmin
            .from("user_favourites")
            .select("id")
            .eq("user_id", userProfile.id)
            .eq("tool_type", cleanToolType)
            .eq("tool_id", cleanToolId)
            .maybeSingle()

        if (existingFavouriteError) {
            console.error("Check existing favourite error:", existingFavouriteError)
            return res.status(500).json({ success: false, error: "Failed to check favourite" })
        }

        if (existingFavourite) {
            return res.status(400).json({ success: false, error: "Already in favourites" })
        }

        const { data: savedFavourite, error: favouriteError } = await supabaseAdmin
            .from("user_favourites")
            .insert({
                user_id: userProfile.id,
                tool_type: cleanToolType,
                tool_id: cleanToolId,
                tool_name: cleanToolName,
            })
            .select("*")
            .single()

        if (favouriteError) {
            console.error("Add favourite error:", favouriteError)
            return res.status(500).json({ success: false, error: "Failed to add favourite" })
        }

        return res.status(200).json({ success: true, data: { favourite: savedFavourite } })
    } catch (err) {
        console.error("Error adding favourite:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RemoveFavourite = async (req: Request, res: Response) => {
    const { id } = req.params
    const favouriteId = String(id)

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Remove favourite profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: deletedFavourite, error: deleteFavouriteError } = await supabaseAdmin
            .from("user_favourites")
            .delete()
            .eq("id", favouriteId)
            .eq("user_id", userProfile.id)
            .select("*")
            .maybeSingle()

        if (deleteFavouriteError) {
            console.error("Remove favourite error:", deleteFavouriteError)
            return res.status(500).json({ success: false, error: "Failed to remove favourite" })
        }

        if (!deletedFavourite) {
            return res.status(404).json({ success: false, error: "Favourite not found" })
        }

        return res.status(200).json({ success: true, data: { message: "Favourite removed successfully" } })
    } catch (err) {
        console.error("Error removing favourite:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetFavourites = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get favourites profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: favourites, error: favouritesError } = await supabaseAdmin
            .from("user_favourites")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })

        if (favouritesError) {
            console.error("Get favourites error:", favouritesError)
            return res.status(500).json({ success: false, error: "Failed to get favourites" })
        }

        return res.status(200).json({ success: true, data: { favourites: favourites || [] } })
    } catch (err) {
        console.error("Error getting favourites:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
