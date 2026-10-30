import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

type AppUserId = string | number

type NormalizedEvent = {
    event_name: string
    event_data: Record<string, unknown>
    session_id: string | null
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const getRequestBody = (req: Request): Record<string, unknown> => {
    if (!isPlainObject(req.body)) {
        return {}
    }

    return req.body
}

// Analytics ingest is forgiving: never drop an event because event_data shape is
// wrong. Missing/null → {}; plain object → keep; array/primitive → wrap as { value }.
// Applied identically for single-event and each item in a batch.
const normalizeEventData = (value: unknown): Record<string, unknown> => {
    if (value === undefined || value === null) {
        return {}
    }

    if (isPlainObject(value)) {
        return value
    }

    return { value }
}

const normalizeSessionId = (value: unknown): string | null => {
    if (value === undefined || value === null) {
        return null
    }

    if (typeof value !== "string") {
        return null
    }

    const trimmed = value.trim()
    return trimmed || null
}

const normalizeEvent = (raw: unknown): { event?: NormalizedEvent; error?: string } => {
    if (!isPlainObject(raw)) {
        return { error: "Each event must be an object" }
    }

    if (typeof raw.event_name !== "string" || !raw.event_name.trim()) {
        return { error: "event_name is required" }
    }

    return {
        event: {
            event_name: raw.event_name.trim(),
            event_data: normalizeEventData(raw.event_data),
            session_id: normalizeSessionId(raw.session_id),
        },
    }
}

type ResolvedSender = {
    userId: AppUserId | null
    /**
     * False only for an identified user who has analytics switched off. An
     * anonymous sender has no consent record to check, so it stays true and the
     * client's own gate remains the control for guest events.
     */
    consented: boolean
}

const resolveSender = async (req: Request): Promise<ResolvedSender> => {
    if (!req.user?.id) {
        return { userId: null, consented: getRequestBody(req).consented === true }
    }

    try {
        const { data: userProfile, error } = await supabaseAdmin
            .from("users")
            .select("id, analytics_enabled")
            .eq("auth_user_id", req.user.id)
            .maybeSingle()

        if (error) {
            console.error("Analytics optional user lookup error:", error)
            return { userId: null, consented: false }
        }

        if (!userProfile) {
            return { userId: null, consented: false }
        }

        return {
            userId: (userProfile.id as AppUserId | undefined) ?? null,
            consented: userProfile.analytics_enabled === true,
        }
    } catch (err) {
        console.error("Analytics optional user lookup failed:", err)
        return { userId: null, consented: false }
    }
}

export const LogAnalyticsEvents = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const hasSingleEvent = Object.prototype.hasOwnProperty.call(body, "event_name")
    const hasBatch = Object.prototype.hasOwnProperty.call(body, "events")

    if (!hasSingleEvent && !hasBatch) {
        return res.status(400).json({
            success: false,
            error: "Provide event_name for a single event, or an events array",
        })
    }

    const normalizedEvents: NormalizedEvent[] = []

    if (hasBatch) {
        if (!Array.isArray(body.events) || body.events.length === 0) {
            return res.status(400).json({
                success: false,
                error: "events must be a non-empty array",
            })
        }

        for (const item of body.events) {
            const normalized = normalizeEvent(item)
            if (normalized.error || !normalized.event) {
                return res.status(400).json({
                    success: false,
                    error: normalized.error || "Invalid event in events array",
                })
            }
            normalizedEvents.push(normalized.event)
        }
    } else {
        const normalized = normalizeEvent(body)
        if (normalized.error || !normalized.event) {
            return res.status(400).json({
                success: false,
                error: normalized.error || "event_name is required",
            })
        }
        normalizedEvents.push(normalized.event)
    }

    try {
        const sender = await resolveSender(req)

        // Server-enforced opt-out: a signed-in user who has analytics off has
        // their events dropped here rather than written. The response stays a
        // 200 success so the client never surfaces an error for honouring the
        // user's own choice.
        if (!sender.consented) {
            return res.status(200).json({
                success: true,
                data: {
                    logged: 0,
                    events: [],
                    skipped: normalizedEvents.length,
                    reason: "analytics_disabled",
                },
            })
        }

        const userId = sender.userId
        const rows = normalizedEvents.map((event) => ({
            user_id: userId,
            session_id: event.session_id,
            event_name: event.event_name,
            event_data: event.event_data,
        }))

        const { data, error } = await supabaseAdmin
            .from("analytics_events")
            .insert(rows)
            .select("id, event_name, event_data, session_id, created_at")

        if (error) {
            console.error("Log analytics events error:", error)
            return res.status(500).json({ success: false, error: "Failed to log analytics events" })
        }

        return res.status(200).json({
            success: true,
            data: {
                logged: data?.length || rows.length,
                events: data || [],
            },
        })
    } catch (err) {
        console.error("Error logging analytics events:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
