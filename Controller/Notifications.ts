import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { sendPush } from "../Utils/PushNotifications.ts"

const NOTIFICATION_SETTING_DEFAULTS = {
    reminders_enabled: false,
    new_collection_alerts: false,
    reminder_time: null as string | null,
}

// "HH:MM" or "HH:MM:SS", 24h. Stored in a `time without time zone` column, so
// the value is normalised to seconds precision before it is written.
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

const normalizeReminderTime = (value: unknown): { value: string | null } | { error: string } => {
    if (value === null) {
        return { value: null }
    }

    if (typeof value !== "string") {
        return { error: "reminder_time must be a 24-hour HH:MM string or null" }
    }

    const trimmed = value.trim()

    if (!trimmed) {
        return { value: null }
    }

    const match = REMINDER_TIME_PATTERN.exec(trimmed)

    if (!match) {
        return { error: "reminder_time must be a 24-hour HH:MM string or null" }
    }

    return { value: `${match[1]}:${match[2]}:${match[3] || "00"}` }
}

const DEVICE_PLATFORMS = ["ios", "android", "web"] as const
type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

const isDevicePlatform = (value: unknown): value is DevicePlatform => {
    return DEVICE_PLATFORMS.includes(value as DevicePlatform)
}

const hasOwn = (value: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(value, key)

const getRequestBody = (req: Request): Record<string, unknown> => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return {}
    }

    return req.body as Record<string, unknown>
}

const getAppUserId = async (req: Request, res: Response): Promise<string | number | null> => {
    const { data: userProfile, error: userProfileError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", req.user!.id)
        .maybeSingle()

    if (userProfileError) {
        console.error("Find user profile for notification preferences error:", userProfileError)
        res.status(500).json({ success: false, error: "Failed to find user profile" })
        return null
    }

    if (!userProfile) {
        res.status(401).json({ success: false, error: "User profile not found" })
        return null
    }

    return userProfile.id as string | number
}

export const GetNotificationPreferences = async (req: Request, res: Response) => {
    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: settings, error: settingsError } = await supabaseAdmin
            .from("user_notification_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (settingsError) {
            console.error("Get notification preferences error:", settingsError)
            return res.status(500).json({ success: false, error: "Failed to get notification preferences" })
        }

        return res.status(200).json({
            success: true,
            data: {
                settings: settings || {
                    user_id: userId,
                    ...NOTIFICATION_SETTING_DEFAULTS,
                    updated_at: null,
                },
            },
        })
    } catch (err) {
        console.error("Error getting notification preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateNotificationPreferences = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const updates: Record<string, unknown> = {}

    for (const field of ["reminders_enabled", "new_collection_alerts"] as const) {
        if (!hasOwn(body, field)) {
            continue
        }

        if (typeof body[field] !== "boolean") {
            return res.status(400).json({ success: false, error: `${field} must be a boolean` })
        }

        updates[field] = body[field]
    }

    // Optional: absent means "leave whatever is stored alone", so existing
    // clients that only send the two booleans behave exactly as before.
    if (hasOwn(body, "reminder_time")) {
        const normalized = normalizeReminderTime(body.reminder_time)

        if ("error" in normalized) {
            return res.status(400).json({ success: false, error: normalized.error })
        }

        updates.reminder_time = normalized.value
    }

    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: existingSettings, error: existingSettingsError } = await supabaseAdmin
            .from("user_notification_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (existingSettingsError) {
            console.error("Find notification preferences before update error:", existingSettingsError)
            return res.status(500).json({ success: false, error: "Failed to update notification preferences" })
        }

        const { data: settings, error: settingsError } = await supabaseAdmin
            .from("user_notification_settings")
            .upsert({
                ...NOTIFICATION_SETTING_DEFAULTS,
                ...(existingSettings || {}),
                ...updates,
                user_id: userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single()

        if (settingsError) {
            console.error("Update notification preferences error:", settingsError)
            return res.status(500).json({ success: false, error: "Failed to update notification preferences" })
        }

        return res.status(200).json({ success: true, data: { settings } })
    } catch (err) {
        console.error("Error updating notification preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RegisterDevice = async (req: Request, res: Response) => {
    const token = String(req.body?.token || "").trim()
    const platform = req.body?.platform

    if (!token) {
        return res.status(400).json({ success: false, error: "token is required" })
    }

    if (!isDevicePlatform(platform)) {
        return res.status(400).json({ success: false, error: "platform must be one of ios, android, or web" })
    }

    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: device, error: deviceError } = await supabaseAdmin
            .from("user_device_tokens")
            .upsert({
                user_id: userId,
                token,
                platform,
            }, { onConflict: "user_id,token" })
            .select("*")
            .single()

        if (deviceError) {
            console.error("Register device error:", deviceError)
            return res.status(500).json({ success: false, error: "Failed to register device" })
        }

        return res.status(200).json({ success: true, data: { device } })
    } catch (err) {
        console.error("Error registering device:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UnregisterDevice = async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim()

    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { error: deleteError } = await supabaseAdmin
            .from("user_device_tokens")
            .delete()
            .eq("user_id", userId)
            .eq("token", token)

        if (deleteError) {
            console.error("Unregister device error:", deleteError)
            return res.status(500).json({ success: false, error: "Failed to unregister device" })
        }

        return res.status(200).json({
            success: true,
            data: { message: "Device unregistered successfully" },
        })
    } catch (err) {
        console.error("Error unregistering device:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SendNewCollectionAlert = async (req: Request, res: Response) => {
    const collectionId = String(req.body?.collection_id || "").trim()
    const title = String(req.body?.title || "").trim()
    const body = String(req.body?.body || "").trim()

    if (!collectionId) {
        return res.status(400).json({ success: false, error: "collection_id is required" })
    }

    if (!title) {
        return res.status(400).json({ success: false, error: "title is required" })
    }

    if (!body) {
        return res.status(400).json({ success: false, error: "body is required" })
    }

    try {
        const { data: collection, error: collectionError } = await supabaseAdmin
            .from("collections")
            .select("id")
            .eq("id", collectionId)
            .maybeSingle()

        if (collectionError) {
            console.error("Send new collection alert collection lookup error:", collectionError)
            return res.status(500).json({ success: false, error: "Failed to send new collection alert" })
        }

        if (!collection) {
            return res.status(400).json({ success: false, error: "Collection not found" })
        }

        const { data: settingsRows, error: settingsError } = await supabaseAdmin
            .from("user_notification_settings")
            .select("user_id")
            .eq("new_collection_alerts", true)

        if (settingsError) {
            console.error("Send new collection alert settings lookup error:", settingsError)
            return res.status(500).json({ success: false, error: "Failed to send new collection alert" })
        }

        const eligibleUserIds = (settingsRows || []).map((row) => row.user_id)

        if (eligibleUserIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: { users_notified: 0, sent: 0, failed: 0, queued: 0, push_configured: false },
            })
        }

        const { data: deviceRows, error: deviceError } = await supabaseAdmin
            .from("user_device_tokens")
            .select("user_id, token")
            .in("user_id", eligibleUserIds)

        if (deviceError) {
            console.error("Send new collection alert device lookup error:", deviceError)
            return res.status(500).json({ success: false, error: "Failed to send new collection alert" })
        }

        const tokensByUser = new Map<string, string[]>()
        for (const row of deviceRows || []) {
            const userId = String(row.user_id)
            if (!tokensByUser.has(userId)) {
                tokensByUser.set(userId, [])
            }
            tokensByUser.get(userId)!.push(String(row.token))
        }

        if (tokensByUser.size === 0) {
            return res.status(200).json({
                success: true,
                data: { users_notified: 0, sent: 0, failed: 0, queued: 0, push_configured: false },
            })
        }

        const allTokens = [...tokensByUser.values()].flat()
        const pushResult = await sendPush(allTokens, {
            title,
            body,
            data: { type: "new_collection", collection_id: collectionId },
        })
        const sentTokens = new Set(pushResult.sent)

        const logRows = [...tokensByUser.entries()].map(([userId, tokens]) => {
            const status = !pushResult.configured
                ? "queued"
                : tokens.some((token) => sentTokens.has(token))
                    ? "sent"
                    : "failed"

            return {
                user_id: userId,
                title,
                body,
                type: "new_collection",
                data: { collection_id: collectionId },
                status,
            }
        })

        const { error: logError } = await supabaseAdmin.from("notifications_log").insert(logRows)

        if (logError) {
            console.error("Send new collection alert log insert error:", logError)
            return res.status(500).json({ success: false, error: "Failed to send new collection alert" })
        }

        const counts = logRows.reduce(
            (acc, row) => {
                acc[row.status as "queued" | "sent" | "failed"] += 1
                return acc
            },
            { queued: 0, sent: 0, failed: 0 }
        )

        return res.status(200).json({
            success: true,
            data: {
                users_notified: logRows.length,
                push_configured: pushResult.configured,
                ...counts,
            },
        })
    } catch (err) {
        console.error("Error sending new collection alert:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
