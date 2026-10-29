import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { getHealthSnapshot } from "./Health.ts"

type EventRow = {
    id: string
    user_id: string | number | null
    session_id: string | null
    event_name: string
    event_data: Record<string, unknown> | null
    created_at: string
}

const SAFE_DETAIL_KEYS = new Set([
    "soundscape_id", "duration_seconds", "position_seconds", "screen_name",
    "step", "previous_step", "platform", "app_version", "reason",
])

const safeDetails = (value: Record<string, unknown> | null) => Object.fromEntries(
    Object.entries(value || {}).filter(([key]) => SAFE_DETAIL_KEYS.has(key))
)

const countBy = (events: EventRow[], name: string, key: string) => {
    const counts = new Map<string, number>()
    events.filter((event) => event.event_name === name).forEach((event) => {
        const value = event.event_data?.[key]
        if (typeof value !== "string" || !value) return
        counts.set(value, (counts.get(value) || 0) + 1)
    })
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
}

export const GetAdminMonitoring = async (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days || 7)
    const days = Number.isInteger(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 7
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    try {
        const [health, eventsResult, usersCountResult] = await Promise.all([
            getHealthSnapshot(),
            supabaseAdmin
                .from("analytics_events")
                .select("id,user_id,session_id,event_name,event_data,created_at")
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(10_000),
            supabaseAdmin.from("users").select("id", { head: true, count: "exact" }),
        ])
        if (eventsResult.error) throw eventsResult.error
        const events = (eventsResult.data || []) as EventRow[]
        const userIds = [...new Set(events.map((event) => event.user_id).filter(Boolean))]
        const soundscapeIds = [...new Set(events
            .map((event) => event.event_data?.soundscape_id)
            .filter((id): id is string => typeof id === "string" && Boolean(id)))]

        const [usersResult, soundscapesResult] = await Promise.all([
            userIds.length
                ? supabaseAdmin.from("users").select("id,name,email").in("id", userIds).limit(1_000)
                : Promise.resolve({ data: [], error: null }),
            soundscapeIds.length
                ? supabaseAdmin.from("soundscapes").select("id,title").in("id", soundscapeIds).limit(1_000)
                : Promise.resolve({ data: [], error: null }),
        ])
        const users = new Map((usersResult.data || []).map((user: any) => [String(user.id), user]))
        const soundscapes = new Map((soundscapesResult.data || []).map((item: any) => [String(item.id), item.title]))
        const eventCounts = new Map<string, number>()
        events.forEach((event) => eventCounts.set(event.event_name, (eventCounts.get(event.event_name) || 0) + 1))
        const plays = countBy(events, "soundscape_play", "soundscape_id").map((item) => ({
            soundscape_id: item.value,
            title: soundscapes.get(item.value) || "Unknown soundscape",
            plays: item.count,
            listening_seconds: events
                .filter((event) => event.event_name === "soundscape_play" && event.event_data?.soundscape_id === item.value)
                .reduce((sum, event) => sum + Math.max(0, Number(event.event_data?.duration_seconds) || 0), 0),
        }))

        return res.status(200).json({ success: true, data: {
            generated_at: new Date().toISOString(), range_days: days, health,
            summary: {
                total_users: usersCountResult.count || 0,
                active_users: new Set(events.map((event) => event.user_id || event.session_id).filter(Boolean)).size,
                app_opens: eventCounts.get("app_open") || 0,
                screen_views: eventCounts.get("screen_view") || 0,
                soundscape_plays: eventCounts.get("soundscape_play") || 0,
                listening_seconds: plays.reduce((sum, item) => sum + item.listening_seconds, 0),
                onboarding_dropoffs: eventCounts.get("onboarding_dropoff") || 0,
            },
            plays,
            screens: countBy(events, "screen_view", "screen_name"),
            onboarding_steps: countBy(events, "onboarding_step_viewed", "step"),
            onboarding_dropoffs: countBy(events, "onboarding_dropoff", "step"),
            recent_activity: events.slice(0, 100).map((event) => {
                const user = event.user_id ? users.get(String(event.user_id)) : null
                return {
                    id: event.id, event_name: event.event_name, created_at: event.created_at,
                    session_id: event.session_id,
                    user: user ? { id: user.id, name: user.name, email: user.email } : null,
                    details: safeDetails(event.event_data),
                }
            }),
        } })
    } catch {
        return res.status(500).json({ success: false, error: "Failed to load monitoring data" })
    }
}

