import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const DOWNLOAD_QUALITIES = ["standard", "high"] as const
const DOWNLOAD_STATUSES = ["queued", "downloading", "completed", "failed"] as const

type DownloadQuality = (typeof DOWNLOAD_QUALITIES)[number]
type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number]

const isDownloadQuality = (value: string): value is DownloadQuality => {
    return DOWNLOAD_QUALITIES.includes(value as DownloadQuality)
}

const isDownloadStatus = (value: string): value is DownloadStatus => {
    return DOWNLOAD_STATUSES.includes(value as DownloadStatus)
}

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
        .select("id, file_size_bytes")
        .eq("id", soundscapeId)
        .eq("status", "live")
        .maybeSingle()
}

export const CreateDownload = async (req: Request, res: Response) => {
    const soundscapeId = String(req.body?.soundscape_id || "").trim()
    const quality = req.body?.quality === undefined
        ? "standard"
        : String(req.body.quality).trim().toLowerCase()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    if (!isDownloadQuality(quality)) {
        return res.status(400).json({
            success: false,
            error: "quality must be one of standard or high",
        })
    }

    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Create download profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: soundscape, error: soundscapeError } = await getLiveSoundscape(soundscapeId)

        if (soundscapeError) {
            console.error("Create download soundscape lookup error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to check soundscape" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found or not live" })
        }

        const { data: download, error: downloadError } = await supabaseAdmin
            .from("user_downloads")
            .upsert({
                user_id: userProfile.id,
                soundscape_id: soundscapeId,
                quality,
                status: "queued",
                progress_percent: 0,
                downloaded_bytes: 0,
                file_size_bytes: soundscape.file_size_bytes ?? null,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,soundscape_id" })
            .select("*")
            .single()

        if (downloadError) {
            console.error("Create download error:", downloadError)
            return res.status(500).json({ success: false, error: "Failed to create download" })
        }

        return res.status(200).json({ success: true, data: { download } })
    } catch (err) {
        console.error("Error creating download:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateDownloadStatus = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.soundscapeId || "").trim()
    const status = String(req.body?.status || "").trim().toLowerCase()

    if (!isDownloadStatus(status)) {
        return res.status(400).json({
            success: false,
            error: "status must be one of queued, downloading, completed, or failed",
        })
    }

    const updates: Record<string, unknown> = { status }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "progress_percent")) {
        const progressPercent = req.body.progress_percent
        if (
            typeof progressPercent !== "number"
            || !Number.isInteger(progressPercent)
            || progressPercent < 0
            || progressPercent > 100
        ) {
            return res.status(400).json({
                success: false,
                error: "progress_percent must be an integer between 0 and 100",
            })
        }
        updates.progress_percent = progressPercent
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "downloaded_bytes")) {
        const downloadedBytes = req.body.downloaded_bytes
        if (typeof downloadedBytes !== "number" || !Number.isInteger(downloadedBytes) || downloadedBytes < 0) {
            return res.status(400).json({
                success: false,
                error: "downloaded_bytes must be a non-negative integer",
            })
        }
        updates.downloaded_bytes = downloadedBytes
    }

    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Update download status profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: download, error: downloadError } = await supabaseAdmin
            .from("user_downloads")
            .update({
                ...updates,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userProfile.id)
            .eq("soundscape_id", soundscapeId)
            .select("*")
            .maybeSingle()

        if (downloadError) {
            console.error("Update download status error:", downloadError)
            return res.status(500).json({ success: false, error: "Failed to update download status" })
        }

        if (!download) {
            return res.status(404).json({ success: false, error: "Download not found" })
        }

        return res.status(200).json({ success: true, data: { download } })
    } catch (err) {
        console.error("Error updating download status:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetDownloads = async (req: Request, res: Response) => {
    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Get downloads profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: downloads, error: downloadsError } = await supabaseAdmin
            .from("user_downloads")
            .select(`
                id,
                user_id,
                soundscape_id,
                quality,
                status,
                file_size_bytes,
                created_at,
                updated_at,
                soundscape:soundscapes!inner(title, artwork_url, mode, duration_seconds)
            `)
            .eq("user_id", userProfile.id)
            .eq("soundscape.status", "live")
            .order("created_at", { ascending: false })

        if (downloadsError) {
            console.error("Get downloads error:", downloadsError)
            return res.status(500).json({ success: false, error: "Failed to get downloads" })
        }

        return res.status(200).json({
            success: true,
            data: { downloads: downloads || [] },
        })
    } catch (err) {
        console.error("Error getting downloads:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetDownloadsStorage = async (req: Request, res: Response) => {
    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Get downloads storage profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        // Storage use reflects what actually occupies device storage right now, so
        // only completed downloads are summed — queued/downloading/failed rows haven't
        // (or didn't) land a full file on disk.
        const { data: downloads, error: downloadsError } = await supabaseAdmin
            .from("user_downloads")
            .select("file_size_bytes")
            .eq("user_id", userProfile.id)
            .eq("status", "completed")

        if (downloadsError) {
            console.error("Get downloads storage error:", downloadsError)
            return res.status(500).json({ success: false, error: "Failed to get downloads storage" })
        }

        const rows = downloads || []
        const totalBytes = rows.reduce((sum, row) => sum + (Number(row.file_size_bytes) || 0), 0)

        return res.status(200).json({
            success: true,
            data: { total_bytes: totalBytes, count: rows.length },
        })
    } catch (err) {
        console.error("Error getting downloads storage:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteAllDownloads = async (req: Request, res: Response) => {
    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Delete all downloads profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: deleted, error: deleteError } = await supabaseAdmin
            .from("user_downloads")
            .delete()
            .eq("user_id", userProfile.id)
            .select("soundscape_id")

        if (deleteError) {
            console.error("Delete all downloads error:", deleteError)
            return res.status(500).json({ success: false, error: "Failed to delete downloads" })
        }

        return res.status(200).json({
            success: true,
            data: { deleted_count: (deleted || []).length },
        })
    } catch (err) {
        console.error("Error deleting all downloads:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteDownload = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.soundscapeId || "").trim()

    try {
        const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

        if (profileError || !userProfile) {
            console.error("Delete download profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: download, error: downloadError } = await supabaseAdmin
            .from("user_downloads")
            .delete()
            .eq("user_id", userProfile.id)
            .eq("soundscape_id", soundscapeId)
            .select("*")
            .maybeSingle()

        if (downloadError) {
            console.error("Delete download error:", downloadError)
            return res.status(500).json({ success: false, error: "Failed to delete download" })
        }

        if (!download) {
            return res.status(404).json({ success: false, error: "Download not found" })
        }

        return res.status(200).json({ success: true, data: { download } })
    } catch (err) {
        console.error("Error deleting download:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
