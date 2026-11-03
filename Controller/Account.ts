import { invalidateUser, invalidateContent, invalidatePreferences } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { validateSoundPreferencesBody } from "./Preferences.ts"

const SOUND_PREFERENCE_DEFAULTS = {
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

const NOTIFICATION_SETTING_DEFAULTS = {
    reminders_enabled: false,
    new_collection_alerts: false,
    reminder_time: null as string | null,
}

type PlaylistItemRow = {
    playlist_id: string | number
    [key: string]: unknown
}

const withDefaults = (
    row: Record<string, unknown> | null,
    userId: string | number,
    defaults: Record<string, unknown>,
) => row || {
    user_id: userId,
    ...defaults,
    updated_at: null,
}

export const ExportAccountData = async (req: Request, res: Response) => {
    try {
        const { data: account, error: accountError } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("auth_user_id", req.user!.id)
            .maybeSingle()

        if (accountError) {
            console.error("Find user profile for account export error:", accountError)
            return res.status(500).json({ success: false, error: "Failed to export account data" })
        }

        if (!account) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const userId = account.id as string | number
        const [
            favouritesResult,
            playlistsResult,
            playHistoryResult,
            soundPreferencesResult,
            playbackSettingsResult,
            notificationSettingsResult,
            supportRequestsResult,
            onboardingResult,
            playerStateResult,
            deviceTokensResult,
        ] = await Promise.all([
            supabaseAdmin
                .from("user_favourites")
                .select("id, user_id, soundscape_id, created_at, soundscape:soundscapes(title)")
                .eq("user_id", userId)
                .order("created_at", { ascending: false }),
            supabaseAdmin
                .from("user_playlists")
                .select("*")
                .eq("user_id", userId)
                .order("updated_at", { ascending: false }),
            supabaseAdmin
                .from("user_play_history")
                .select("id, user_id, soundscape_id, played_at, soundscape:soundscapes(title)")
                .eq("user_id", userId)
                .order("played_at", { ascending: false }),
            supabaseAdmin
                .from("user_sound_preferences")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            supabaseAdmin
                .from("user_playback_settings")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            supabaseAdmin
                .from("user_notification_settings")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            supabaseAdmin
                .from("support_requests")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false }),
            supabaseAdmin
                .from("user_onboarding")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            supabaseAdmin
                .from("user_player_state")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            supabaseAdmin
                .from("user_device_tokens")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false }),
        ])

        const queryErrors = [
            ["favourites", favouritesResult.error],
            ["playlists", playlistsResult.error],
            ["play history", playHistoryResult.error],
            ["sound preferences", soundPreferencesResult.error],
            ["playback settings", playbackSettingsResult.error],
            ["notification settings", notificationSettingsResult.error],
            ["support requests", supportRequestsResult.error],
            ["onboarding", onboardingResult.error],
            ["player state", playerStateResult.error],
            ["device tokens", deviceTokensResult.error],
        ] as const
        const failedQuery = queryErrors.find(([, error]) => error)

        if (failedQuery) {
            console.error(`Account export ${failedQuery[0]} query error:`, failedQuery[1])
            return res.status(500).json({ success: false, error: "Failed to export account data" })
        }

        const playlistRows = playlistsResult.data || []
        let playlistItems: PlaylistItemRow[] = []

        if (playlistRows.length > 0) {
            const playlistIds = playlistRows.map((playlist) => playlist.id)
            const { data: itemRows, error: playlistItemsError } = await supabaseAdmin
                .from("user_playlist_items")
                .select("playlist_id, soundscape_id, sort_order, added_at, soundscape:soundscapes(title)")
                .in("playlist_id", playlistIds)
                .order("sort_order", { ascending: true })

            if (playlistItemsError) {
                console.error("Account export playlist items query error:", playlistItemsError)
                return res.status(500).json({ success: false, error: "Failed to export account data" })
            }

            playlistItems = (itemRows || []) as PlaylistItemRow[]
        }

        const playlists = playlistRows.map((playlist) => ({
            ...playlist,
            items: playlistItems.filter(
                (item) => String(item.playlist_id) === String(playlist.id),
            ),
        }))

        return res.status(200).json({
            success: true,
            data: {
                exported_at: new Date().toISOString(),
                account,
                favourites: favouritesResult.data || [],
                playlists,
                play_history: {
                    entries: playHistoryResult.data || [],
                },
                onboarding: onboardingResult.data || null,
                player_state: playerStateResult.data || null,
                device_tokens: deviceTokensResult.data || [],
                sound_preferences: withDefaults(
                    soundPreferencesResult.data,
                    userId,
                    SOUND_PREFERENCE_DEFAULTS,
                ),
                playback_settings: withDefaults(
                    playbackSettingsResult.data,
                    userId,
                    PLAYBACK_SETTING_DEFAULTS,
                ),
                notification_settings: withDefaults(
                    notificationSettingsResult.data,
                    userId,
                    NOTIFICATION_SETTING_DEFAULTS,
                ),
                support_requests: supportRequestsResult.data || [],
            },
        })
    } catch (err) {
        console.error("Error exporting account data:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
