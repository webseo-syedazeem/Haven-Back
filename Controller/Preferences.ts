import { invalidatePreferences } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const SOUND_ARRAY_FIELDS = [
    "preferred_environments",
    "preferred_sounds",
    "preferred_animals",
    "preferred_instruments",
    "excluded_sounds",
] as const

const DETAIL_PREFERENCES = ["minimal", "balanced", "rich"] as const
const END_BEHAVIOURS = ["silent", "gentle_tone"] as const
const QUALITY_OPTIONS = ["standard", "high"] as const

export const SOUND_PREFERENCE_DEFAULTS = {
    preferred_environments: [] as string[],
    preferred_sounds: [] as string[],
    preferred_animals: [] as string[],
    preferred_instruments: [] as string[],
    excluded_sounds: [] as string[],
    detail_preference: null as string | null,
    typical_duration: null as string | null,
    intensity_preference: null as number | null,
}

const PLAYBACK_SETTING_DEFAULTS = {
    background_playback: true,
    default_timer_minutes: null as number | null,
    fade_enabled: true,
    end_behaviour: "silent",
    quality: "standard",
    autoplay_next: false,
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
        console.error("Find user profile for preferences error:", userProfileError)
        res.status(500).json({ success: false, error: "Failed to find user profile" })
        return null
    }

    if (!userProfile) {
        res.status(401).json({ success: false, error: "User profile not found" })
        return null
    }

    return userProfile.id as string | number
}

export const GetSoundPreferences = async (req: Request, res: Response) => {
    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: preferences, error: preferencesError } = await supabaseAdmin
            .from("user_sound_preferences")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (preferencesError) {
            console.error("Get sound preferences error:", preferencesError)
            return res.status(500).json({ success: false, error: "Failed to get sound preferences" })
        }

        return res.status(200).json({
            success: true,
            data: {
                preferences: preferences || {
                    user_id: userId,
                    ...SOUND_PREFERENCE_DEFAULTS,
                    updated_at: null,
                },
            },
        })
    } catch (err) {
        console.error("Error getting sound preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const validateSoundPreferencesBody = (
    body: Record<string, unknown>
): { updates: Record<string, unknown>; error?: string } => {
    const updates: Record<string, unknown> = {}

    for (const field of SOUND_ARRAY_FIELDS) {
        if (!hasOwn(body, field)) {
            continue
        }

        if (!Array.isArray(body[field]) || !body[field].every((value) => typeof value === "string")) {
            return { updates, error: `${field} must be an array of strings` }
        }

        updates[field] = body[field]
    }

    if (hasOwn(body, "detail_preference")) {
        if (!DETAIL_PREFERENCES.includes(body.detail_preference as typeof DETAIL_PREFERENCES[number])) {
            return { updates, error: "detail_preference must be one of minimal, balanced, or rich" }
        }

        updates.detail_preference = body.detail_preference
    }

    if (hasOwn(body, "typical_duration")) {
        if (body.typical_duration !== null && typeof body.typical_duration !== "string") {
            return { updates, error: "typical_duration must be a string or null" }
        }

        updates.typical_duration = body.typical_duration
    }

    if (hasOwn(body, "intensity_preference")) {
        if (
            typeof body.intensity_preference !== "number"
            || !Number.isInteger(body.intensity_preference)
            || body.intensity_preference < 1
            || body.intensity_preference > 5
        ) {
            return { updates, error: "intensity_preference must be an integer between 1 and 5" }
        }

        updates.intensity_preference = body.intensity_preference
    }

    return { updates }
}

export const UpdateSoundPreferences = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const validated = validateSoundPreferencesBody(body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    const updates = validated.updates

    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: existingPreferences, error: existingPreferencesError } = await supabaseAdmin
            .from("user_sound_preferences")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (existingPreferencesError) {
            console.error("Find sound preferences before update error:", existingPreferencesError)
            return res.status(500).json({ success: false, error: "Failed to update sound preferences" })
        }

        const { data: preferences, error: preferencesError } = await supabaseAdmin
            .from("user_sound_preferences")
            .upsert({
                ...SOUND_PREFERENCE_DEFAULTS,
                ...(existingPreferences || {}),
                ...updates,
                user_id: userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single()

        if (preferencesError) {
            console.error("Update sound preferences error:", preferencesError)
            return res.status(500).json({ success: false, error: "Failed to update sound preferences" })
        }

        await invalidatePreferences(req.user!.id)

        return res.status(200).json({ success: true, data: { preferences } })
    } catch (err) {
        console.error("Error updating sound preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetPlaybackPreferences = async (req: Request, res: Response) => {
    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: settings, error: settingsError } = await supabaseAdmin
            .from("user_playback_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (settingsError) {
            console.error("Get playback preferences error:", settingsError)
            return res.status(500).json({ success: false, error: "Failed to get playback preferences" })
        }

        return res.status(200).json({
            success: true,
            data: {
                settings: settings || {
                    user_id: userId,
                    ...PLAYBACK_SETTING_DEFAULTS,
                    updated_at: null,
                },
            },
        })
    } catch (err) {
        console.error("Error getting playback preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdatePlaybackPreferences = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const updates: Record<string, unknown> = {}

    for (const field of ["background_playback", "fade_enabled", "autoplay_next"] as const) {
        if (!hasOwn(body, field)) {
            continue
        }

        if (typeof body[field] !== "boolean") {
            return res.status(400).json({ success: false, error: `${field} must be a boolean` })
        }

        updates[field] = body[field]
    }

    if (hasOwn(body, "default_timer_minutes")) {
        if (
            body.default_timer_minutes !== null
            && (
                typeof body.default_timer_minutes !== "number"
                || !Number.isInteger(body.default_timer_minutes)
                || body.default_timer_minutes < 0
            )
        ) {
            return res.status(400).json({
                success: false,
                error: "default_timer_minutes must be a non-negative integer or null",
            })
        }

        updates.default_timer_minutes = body.default_timer_minutes
    }

    if (hasOwn(body, "end_behaviour")) {
        if (!END_BEHAVIOURS.includes(body.end_behaviour as typeof END_BEHAVIOURS[number])) {
            return res.status(400).json({
                success: false,
                error: "end_behaviour must be one of silent or gentle_tone",
            })
        }

        updates.end_behaviour = body.end_behaviour
    }

    if (hasOwn(body, "quality")) {
        if (!QUALITY_OPTIONS.includes(body.quality as typeof QUALITY_OPTIONS[number])) {
            return res.status(400).json({ success: false, error: "quality must be one of standard or high" })
        }

        updates.quality = body.quality
    }

    try {
        const userId = await getAppUserId(req, res)

        if (userId === null) {
            return
        }

        const { data: existingSettings, error: existingSettingsError } = await supabaseAdmin
            .from("user_playback_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (existingSettingsError) {
            console.error("Find playback preferences before update error:", existingSettingsError)
            return res.status(500).json({ success: false, error: "Failed to update playback preferences" })
        }

        const { data: settings, error: settingsError } = await supabaseAdmin
            .from("user_playback_settings")
            .upsert({
                ...PLAYBACK_SETTING_DEFAULTS,
                ...(existingSettings || {}),
                ...updates,
                user_id: userId,
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single()

        if (settingsError) {
            console.error("Update playback preferences error:", settingsError)
            return res.status(500).json({ success: false, error: "Failed to update playback preferences" })
        }

        return res.status(200).json({ success: true, data: { settings } })
    } catch (err) {
        console.error("Error updating playback preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

/**
 * Privacy preferences.
 *
 * `analytics_enabled` lives on `public.users` rather than in its own settings
 * table because it gates a whole-account behaviour that the analytics ingest
 * has to check on every request — keeping it on the row that lookup already
 * loads avoids a second query per event. It is exposed here, next to the other
 * `/api/preferences/*` endpoints, and returned under `data.settings` so it
 * matches the shape of playback and notification settings.
 *
 * It is deliberately NOT folded into an existing preferences endpoint: the
 * frontend caches those four payloads independently, and adding an unrelated
 * key to one of them would surprise the screen that owns it.
 */
export const GetPrivacyPreferences = async (req: Request, res: Response) => {
    try {
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id, analytics_enabled")
            .eq("auth_user_id", req.user!.id)
            .maybeSingle()

        if (profileError) {
            console.error("Get privacy preferences error:", profileError)
            return res.status(500).json({ success: false, error: "Failed to get privacy preferences" })
        }

        if (!profile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        return res.status(200).json({
            success: true,
            data: {
                settings: {
                    user_id: profile.id,
                    analytics_enabled: profile.analytics_enabled === true,
                },
            },
        })
    } catch (err) {
        console.error("Error getting privacy preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdatePrivacyPreferences = async (req: Request, res: Response) => {
    const body = getRequestBody(req)

    if (!hasOwn(body, "analytics_enabled")) {
        return res.status(400).json({ success: false, error: "analytics_enabled is required" })
    }

    if (typeof body.analytics_enabled !== "boolean") {
        return res.status(400).json({ success: false, error: "analytics_enabled must be a boolean" })
    }

    try {
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .update({ analytics_enabled: body.analytics_enabled })
            .eq("auth_user_id", req.user!.id)
            .select("id, analytics_enabled")
            .maybeSingle()

        if (profileError) {
            console.error("Update privacy preferences error:", profileError)
            return res.status(500).json({ success: false, error: "Failed to update privacy preferences" })
        }

        if (!profile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        return res.status(200).json({
            success: true,
            data: {
                settings: {
                    user_id: profile.id,
                    analytics_enabled: profile.analytics_enabled === true,
                },
            },
        })
    } catch (err) {
        console.error("Error updating privacy preferences:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
