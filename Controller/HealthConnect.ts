// Steadia - HealthConnect Integration
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const VALID_PROVIDERS = ["apple", "google"] as const
type HealthProvider = (typeof VALID_PROVIDERS)[number]

const cleanProvider = (value: unknown): HealthProvider | null => {
    const provider = String(value || "").trim().toLowerCase()
    return VALID_PROVIDERS.includes(provider as HealthProvider) ? (provider as HealthProvider) : null
}

export const saveConnection = async (req: Request, res: Response) => {
    const user = req.user
    const provider = cleanProvider(req.body?.provider)
    const permissions = req.body?.permissions ?? null
    const isConnected = typeof req.body?.is_connected === "boolean" ? req.body.is_connected : true

    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid or missing session" })
    }

    if (!provider) {
        return res.status(400).json({ success: false, error: "provider must be apple or google" })
    }

    try {
        const { data, error } = await supabaseAdmin
            .from("health_connections")
            .upsert(
                {
                    user_id: user.id,
                    provider,
                    is_connected: isConnected,
                    permissions,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,provider" }
            )
            .select("*")
            .single()

        if (error) {
            console.error("Save health connection error:", error)
            return res.status(500).json({ success: false, error: "Failed to save health connection" })
        }

        return res.status(200).json({ success: true, data: { connection: data } })
    } catch (err) {
        console.error("Error saving health connection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const getConnectionStatus = async (req: Request, res: Response) => {
    const user = req.user
    const userId = String(req.params.userId || "").trim()

    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid or missing session" })
    }

    if (!userId) {
        return res.status(400).json({ success: false, error: "userId is required" })
    }

    if (userId !== user.id) {
        return res.status(403).json({ success: false, error: "Cannot access another user's health connections" })
    }

    try {
        const { data, error } = await supabaseAdmin
            .from("health_connections")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })

        if (error) {
            console.error("Get health connection status error:", error)
            return res.status(500).json({ success: false, error: "Failed to get health connection status" })
        }

        return res.status(200).json({ success: true, data: { connections: data || [] } })
    } catch (err) {
        console.error("Error getting health connection status:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const disconnectProvider = async (req: Request, res: Response) => {
    const user = req.user
    const provider = cleanProvider(req.body?.provider)

    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid or missing session" })
    }

    if (!provider) {
        return res.status(400).json({ success: false, error: "provider must be apple or google" })
    }

    try {
        const { data, error } = await supabaseAdmin
            .from("health_connections")
            .update({ is_connected: false, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("provider", provider)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("Disconnect health provider error:", error)
            return res.status(500).json({ success: false, error: "Failed to disconnect health provider" })
        }

        return res.status(200).json({ success: true, data: { connection: data, message: "Health provider disconnected" } })
    } catch (err) {
        console.error("Error disconnecting health provider:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const deleteAllConnections = async (req: Request, res: Response) => {
    const user = req.user

    if (!user) {
        return res.status(401).json({ success: false, error: "Invalid or missing session" })
    }

    try {
        const { error } = await supabaseAdmin
            .from("health_connections")
            .delete()
            .eq("user_id", user.id)

        if (error) {
            console.error("Delete all health connections error:", error)
            return res.status(500).json({ success: false, error: "Failed to delete health data" })
        }

        return res.status(200).json({ success: true, data: { message: "All health data deleted" } })
    } catch (err) {
        console.error("Error deleting health data:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
