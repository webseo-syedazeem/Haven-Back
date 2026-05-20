import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const NOTIFICATION_FIELDS = [
    "morning_reminder",
    "morning_reminder_time",
    "mood_checkin",
    "mood_checkin_time",
    "checklist_reminder",
    "checklist_reminder_time",
    "evening_wind_down",
    "evening_wind_down_time",
    "soundscape_reminder",
    "soundscape_reminder_time",
]

const buildNotificationPayload = (body: Record<string, unknown>, partial = false) => {
    const payload: Record<string, unknown> = {}

    NOTIFICATION_FIELDS.forEach((field) => {
        if (!partial || Object.prototype.hasOwnProperty.call(body, field)) {
            payload[field] = body[field]
        }
    })

    return payload
}

export const SaveNotifications = async (req: Request, res: Response) => {
    const payload = buildNotificationPayload(req.body || {})

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Save notifications profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingNotifications, error: existingNotificationsError } = await supabaseAdmin
            .from("user_notifications")
            .select("id")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingNotificationsError) {
            console.error("Check existing notifications error:", existingNotificationsError)
            return res.status(500).json({ success: false, error: "Failed to check notifications" })
        }

        if (existingNotifications) {
            return res.status(400).json({ success: false, error: "Notifications already saved. Use PUT to update." })
        }

        const { data: savedNotifications, error: notificationsError } = await supabaseAdmin
            .from("user_notifications")
            .insert({
                user_id: userProfile.id,
                ...payload,
            })
            .select("*")
            .single()

        if (notificationsError) {
            console.error("Save notifications error:", notificationsError)
            return res.status(500).json({ success: false, error: "Failed to save notifications" })
        }

        return res.status(200).json({ success: true, data: { notifications: savedNotifications } })
    } catch (err) {
        console.error("Error saving notifications:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateNotifications = async (req: Request, res: Response) => {
    const payload = buildNotificationPayload(req.body || {}, true)

    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Update notifications profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: existingNotifications, error: existingNotificationsError } = await supabaseAdmin
            .from("user_notifications")
            .select("id")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (existingNotificationsError) {
            console.error("Find notifications error:", existingNotificationsError)
            return res.status(500).json({ success: false, error: "Failed to find notifications" })
        }

        if (!existingNotifications) {
            return res.status(404).json({ success: false, error: "Notifications not found" })
        }

        const { data: updatedNotifications, error: updateNotificationsError } = await supabaseAdmin
            .from("user_notifications")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("user_id", userProfile.id)
            .select("*")
            .single()

        if (updateNotificationsError) {
            console.error("Update notifications error:", updateNotificationsError)
            return res.status(500).json({ success: false, error: "Failed to update notifications" })
        }

        return res.status(200).json({ success: true, data: { notifications: updatedNotifications } })
    } catch (err) {
        console.error("Error updating notifications:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetNotifications = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError || !userProfile) {
            console.error("Get notifications profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: notifications, error: notificationsError } = await supabaseAdmin
            .from("user_notifications")
            .select("*")
            .eq("user_id", userProfile.id)
            .maybeSingle()

        if (notificationsError) {
            console.error("Get notifications error:", notificationsError)
            return res.status(500).json({ success: false, error: "Failed to get notifications" })
        }

        return res.status(200).json({ success: true, data: { notifications: notifications || null } })
    } catch (err) {
        console.error("Error getting notifications:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
