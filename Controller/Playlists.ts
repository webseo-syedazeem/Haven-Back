import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

type PlaylistItemRow = {
    playlist_id: string
    soundscape_id: string
    sort_order: number
    added_at: string
    soundscapes?: Record<string, unknown> | Record<string, unknown>[] | null
}

const getUserProfileId = async (authUserId: string, logPrefix: string) => {
    const { data: userProfile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .maybeSingle()

    if (profileError || !userProfile) {
        console.error(`${logPrefix} user profile error:`, profileError)
        return null
    }

    return Number(userProfile.id)
}

const getOwnedPlaylist = async (playlistId: string, userId: number) => {
    const { data: playlist, error } = await supabaseAdmin
        .from("user_playlists")
        .select("*")
        .eq("id", playlistId)
        .eq("user_id", userId)
        .maybeSingle()

    if (error) {
        throw error
    }

    return playlist
}

const getLiveSoundscape = async (soundscapeId: string) => {
    const { data: soundscape, error } = await supabaseAdmin
        .from("soundscapes")
        .select("*")
        .eq("id", soundscapeId)
        .eq("status", "live")
        .maybeSingle()

    if (error) {
        throw error
    }

    return soundscape
}

const touchPlaylist = async (playlistId: string, userId: number) => {
    const { error } = await supabaseAdmin
        .from("user_playlists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", playlistId)
        .eq("user_id", userId)

    if (error) {
        throw error
    }
}

const normalizeOptionalText = (value: unknown) => {
    if (value === null) {
        return null
    }

    return String(value).trim()
}

const populatePlaylistItems = (items: PlaylistItemRow[]) => {
    return items.map(({ soundscapes, ...item }) => ({
        ...item,
        soundscape: Array.isArray(soundscapes)
            ? soundscapes[0] || null
            : soundscapes || null,
    }))
}

export const CreatePlaylist = async (req: Request, res: Response) => {
    const { name, description, cover_image_url } = req.body || {}
    const cleanName = String(name || "").trim()

    if (!cleanName) {
        return res.status(400).json({ success: false, error: "name is required" })
    }

    try {
        const userId = await getUserProfileId(req.user!.id, "Create playlist")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: playlist, error: playlistError } = await supabaseAdmin
            .from("user_playlists")
            .insert({
                user_id: userId,
                name: cleanName,
                description: description === undefined ? null : normalizeOptionalText(description),
                cover_image_url: cover_image_url === undefined ? null : normalizeOptionalText(cover_image_url),
            })
            .select("*")
            .single()

        if (playlistError) {
            console.error("Create playlist error:", playlistError)
            return res.status(500).json({ success: false, error: "Failed to create playlist" })
        }

        return res.status(201).json({ success: true, data: { playlist } })
    } catch (err) {
        console.error("Error creating playlist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetPlaylists = async (req: Request, res: Response) => {
    try {
        const userId = await getUserProfileId(req.user!.id, "Get playlists")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: playlists, error: playlistsError } = await supabaseAdmin
            .from("user_playlists")
            .select("*")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })

        if (playlistsError) {
            console.error("Get playlists error:", playlistsError)
            return res.status(500).json({ success: false, error: "Failed to get playlists" })
        }

        const playlistRows = playlists || []
        const itemCounts = new Map<string, number>()

        if (playlistRows.length > 0) {
            const playlistIds = playlistRows.map((playlist) => String(playlist.id))
            const { data: items, error: itemsError } = await supabaseAdmin
                .from("user_playlist_items")
                .select("playlist_id")
                .in("playlist_id", playlistIds)

            if (itemsError) {
                console.error("Get playlist item counts error:", itemsError)
                return res.status(500).json({ success: false, error: "Failed to get playlists" })
            }

            for (const item of items || []) {
                const playlistId = String(item.playlist_id)
                itemCounts.set(playlistId, (itemCounts.get(playlistId) || 0) + 1)
            }
        }

        const playlistsWithCounts = playlistRows.map((playlist) => ({
            ...playlist,
            item_count: itemCounts.get(String(playlist.id)) || 0,
        }))

        return res.status(200).json({
            success: true,
            data: { playlists: playlistsWithCounts },
        })
    } catch (err) {
        console.error("Error getting playlists:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOnePlaylist = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()

    try {
        const userId = await getUserProfileId(req.user!.id, "Get playlist")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const playlist = await getOwnedPlaylist(playlistId, userId)

        if (!playlist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        const { data: items, error: itemsError } = await supabaseAdmin
            .from("user_playlist_items")
            .select("playlist_id, soundscape_id, sort_order, added_at, soundscapes!inner(*)")
            .eq("playlist_id", playlistId)
            .eq("soundscapes.status", "live")
            .order("sort_order", { ascending: true })

        if (itemsError) {
            console.error("Get playlist items error:", itemsError)
            return res.status(500).json({ success: false, error: "Failed to get playlist" })
        }

        return res.status(200).json({
            success: true,
            data: {
                playlist: {
                    ...playlist,
                    items: populatePlaylistItems((items || []) as PlaylistItemRow[]),
                },
            },
        })
    } catch (err) {
        console.error("Error getting playlist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdatePlaylist = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()
    const { name, description, cover_image_url } = req.body || {}
    const updates: Record<string, unknown> = {}

    if (name !== undefined) {
        const cleanName = String(name || "").trim()

        if (!cleanName) {
            return res.status(400).json({ success: false, error: "name cannot be empty" })
        }

        updates.name = cleanName
    }

    if (description !== undefined) {
        updates.description = normalizeOptionalText(description)
    }

    if (cover_image_url !== undefined) {
        updates.cover_image_url = normalizeOptionalText(cover_image_url)
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            success: false,
            error: "At least one playlist field is required",
        })
    }

    updates.updated_at = new Date().toISOString()

    try {
        const userId = await getUserProfileId(req.user!.id, "Update playlist")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const existingPlaylist = await getOwnedPlaylist(playlistId, userId)

        if (!existingPlaylist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        const { data: playlist, error: playlistError } = await supabaseAdmin
            .from("user_playlists")
            .update(updates)
            .eq("id", playlistId)
            .eq("user_id", userId)
            .select("*")
            .single()

        if (playlistError) {
            console.error("Update playlist error:", playlistError)
            return res.status(500).json({ success: false, error: "Failed to update playlist" })
        }

        return res.status(200).json({ success: true, data: { playlist } })
    } catch (err) {
        console.error("Error updating playlist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeletePlaylist = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()

    try {
        const userId = await getUserProfileId(req.user!.id, "Delete playlist")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: deletedPlaylist, error: playlistError } = await supabaseAdmin
            .from("user_playlists")
            .delete()
            .eq("id", playlistId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle()

        if (playlistError) {
            console.error("Delete playlist error:", playlistError)
            return res.status(500).json({ success: false, error: "Failed to delete playlist" })
        }

        if (!deletedPlaylist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        return res.status(200).json({
            success: true,
            data: { message: "Playlist deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting playlist:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const AddPlaylistItem = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()
    const soundscapeId = String(req.body?.soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    try {
        const userId = await getUserProfileId(req.user!.id, "Add playlist item")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const playlist = await getOwnedPlaylist(playlistId, userId)

        if (!playlist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        const soundscape = await getLiveSoundscape(soundscapeId)

        if (!soundscape) {
            return res.status(400).json({
                success: false,
                error: "Soundscape not found or not live",
            })
        }

        const { data: existingItem, error: existingItemError } = await supabaseAdmin
            .from("user_playlist_items")
            .select("playlist_id")
            .eq("playlist_id", playlistId)
            .eq("soundscape_id", soundscapeId)
            .maybeSingle()

        if (existingItemError) {
            console.error("Check playlist item error:", existingItemError)
            return res.status(500).json({ success: false, error: "Failed to add playlist item" })
        }

        if (existingItem) {
            return res.status(400).json({
                success: false,
                error: "Soundscape already in playlist",
            })
        }

        const { data: lastItem, error: lastItemError } = await supabaseAdmin
            .from("user_playlist_items")
            .select("sort_order")
            .eq("playlist_id", playlistId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (lastItemError) {
            console.error("Get playlist sort order error:", lastItemError)
            return res.status(500).json({ success: false, error: "Failed to add playlist item" })
        }

        const sortOrder = lastItem ? Number(lastItem.sort_order) + 1 : 0
        const { data: item, error: itemError } = await supabaseAdmin
            .from("user_playlist_items")
            .insert({
                playlist_id: playlistId,
                soundscape_id: soundscapeId,
                sort_order: sortOrder,
            })
            .select("*")
            .single()

        if (itemError) {
            if (itemError.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "Soundscape already in playlist",
                })
            }

            console.error("Add playlist item error:", itemError)
            return res.status(500).json({ success: false, error: "Failed to add playlist item" })
        }

        await touchPlaylist(playlistId, userId)

        return res.status(201).json({
            success: true,
            data: {
                item: {
                    ...item,
                    soundscape,
                },
            },
        })
    } catch (err) {
        console.error("Error adding playlist item:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RemovePlaylistItem = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()
    const soundscapeId = String(req.params.soundscapeId || "").trim()

    try {
        const userId = await getUserProfileId(req.user!.id, "Remove playlist item")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const playlist = await getOwnedPlaylist(playlistId, userId)

        if (!playlist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        const { data: deletedItem, error: itemError } = await supabaseAdmin
            .from("user_playlist_items")
            .delete()
            .eq("playlist_id", playlistId)
            .eq("soundscape_id", soundscapeId)
            .select("soundscape_id")
            .maybeSingle()

        if (itemError) {
            console.error("Remove playlist item error:", itemError)
            return res.status(500).json({ success: false, error: "Failed to remove playlist item" })
        }

        if (!deletedItem) {
            return res.status(404).json({ success: false, error: "Playlist item not found" })
        }

        await touchPlaylist(playlistId, userId)

        return res.status(200).json({
            success: true,
            data: { message: "Playlist item removed successfully" },
        })
    } catch (err) {
        console.error("Error removing playlist item:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ReorderPlaylistItems = async (req: Request, res: Response) => {
    const playlistId = String(req.params.id || "").trim()
    const soundscapeIds = req.body?.soundscape_ids

    if (!Array.isArray(soundscapeIds)) {
        return res.status(400).json({
            success: false,
            error: "soundscape_ids must be an array",
        })
    }

    const cleanSoundscapeIds = soundscapeIds.map((id) => String(id || "").trim())

    if (
        cleanSoundscapeIds.some((id) => !id)
        || new Set(cleanSoundscapeIds).size !== cleanSoundscapeIds.length
    ) {
        return res.status(400).json({
            success: false,
            error: "soundscape_ids must contain unique, non-empty ids",
        })
    }

    try {
        const userId = await getUserProfileId(req.user!.id, "Reorder playlist items")

        if (userId === null) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const playlist = await getOwnedPlaylist(playlistId, userId)

        if (!playlist) {
            return res.status(404).json({ success: false, error: "Playlist not found" })
        }

        const { data: currentItems, error: currentItemsError } = await supabaseAdmin
            .from("user_playlist_items")
            .select("soundscape_id")
            .eq("playlist_id", playlistId)

        if (currentItemsError) {
            console.error("Get playlist items for reorder error:", currentItemsError)
            return res.status(500).json({ success: false, error: "Failed to reorder playlist" })
        }

        const currentIds = (currentItems || []).map((item) => String(item.soundscape_id))
        const requestedSet = new Set(cleanSoundscapeIds)

        if (
            currentIds.length !== cleanSoundscapeIds.length
            || currentIds.some((id) => !requestedSet.has(id))
        ) {
            return res.status(400).json({
                success: false,
                error: "soundscape_ids must exactly match the playlist items",
            })
        }

        if (cleanSoundscapeIds.length > 0) {
            const updates = cleanSoundscapeIds.map((soundscapeId, index) => ({
                playlist_id: playlistId,
                soundscape_id: soundscapeId,
                sort_order: index,
            }))

            const { error: reorderError } = await supabaseAdmin
                .from("user_playlist_items")
                .upsert(updates, { onConflict: "playlist_id,soundscape_id" })

            if (reorderError) {
                console.error("Reorder playlist items error:", reorderError)
                return res.status(500).json({ success: false, error: "Failed to reorder playlist" })
            }
        }

        await touchPlaylist(playlistId, userId)

        const { data: reorderedItems, error: reorderedItemsError } = await supabaseAdmin
            .from("user_playlist_items")
            .select("playlist_id, soundscape_id, sort_order, added_at, soundscapes!inner(*)")
            .eq("playlist_id", playlistId)
            .eq("soundscapes.status", "live")
            .order("sort_order", { ascending: true })

        if (reorderedItemsError) {
            console.error("Get reordered playlist items error:", reorderedItemsError)
            return res.status(500).json({ success: false, error: "Failed to reorder playlist" })
        }

        return res.status(200).json({
            success: true,
            data: {
                items: populatePlaylistItems((reorderedItems || []) as PlaylistItemRow[]),
            },
        })
    } catch (err) {
        console.error("Error reordering playlist items:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}