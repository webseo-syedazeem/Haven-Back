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

const DOWNLOAD_SETTING_DEFAULTS = {
    wifi_only: true,
    quality: "standard",
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
            downloadsResult,
            playHistoryResult,
            soundPreferencesResult,
            playbackSettingsResult,
            downloadSettingsResult,
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
                .from("user_downloads")
                .select("*, soundscape:soundscapes(title)")
                .eq("user_id", userId)
                .order("created_at", { ascending: false }),
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
                .from("user_download_settings")
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
            ["downloads", downloadsResult.error],
            ["play history", playHistoryResult.error],
            ["sound preferences", soundPreferencesResult.error],
            ["playback settings", playbackSettingsResult.error],
            ["download settings", downloadSettingsResult.error],
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
                downloads: downloadsResult.data || [],
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
                download_settings: withDefaults(
                    downloadSettingsResult.data,
                    userId,
                    DOWNLOAD_SETTING_DEFAULTS,
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

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const normalizeOptionalText = (value: unknown) => {
    if (value === null || value === undefined) {
        return null
    }

    return String(value).trim()
}

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return []
    }

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
}

type ImportPlaylistInput = {
    name: string
    description?: unknown
    cover_image_url?: unknown
    soundscapeIds: string[]
}

// Best-effort batch import for guest -> account migration (R-02). Guest data lives in
// local device storage, so this endpoint has no local state of its own to reconcile
// against — it just applies whatever the client sends, skipping individual invalid
// items (already-favourited, non-live soundscape ids) rather than failing the whole
// request. It is not a transactional guarantee: if a later step fails after earlier
// steps already wrote data, those earlier writes are not rolled back.
export const ImportGuestData = async (req: Request, res: Response) => {
    const body = isObject(req.body) ? req.body : {}

    const favouriteIds = toStringArray(body.favourites)

    const rawPlaylists = Array.isArray(body.playlists) ? body.playlists : []
    const playlistInputs: ImportPlaylistInput[] = []

    for (const rawPlaylist of rawPlaylists) {
        if (!isObject(rawPlaylist) || typeof rawPlaylist.name !== "string" || !rawPlaylist.name.trim()) {
            return res.status(400).json({
                success: false,
                error: "Each entry in playlists requires a non-empty name",
            })
        }

        if (rawPlaylist.soundscape_ids !== undefined && !Array.isArray(rawPlaylist.soundscape_ids)) {
            return res.status(400).json({
                success: false,
                error: "playlists[].soundscape_ids must be an array",
            })
        }

        playlistInputs.push({
            name: rawPlaylist.name.trim(),
            description: rawPlaylist.description,
            cover_image_url: rawPlaylist.cover_image_url,
            soundscapeIds: toStringArray(rawPlaylist.soundscape_ids),
        })
    }

    let soundPreferencesUpdates: Record<string, unknown> | null = null
    if (body.sound_preferences !== undefined) {
        if (!isObject(body.sound_preferences)) {
            return res.status(400).json({ success: false, error: "sound_preferences must be an object" })
        }

        const validated = validateSoundPreferencesBody(body.sound_preferences)
        if (validated.error) {
            return res.status(400).json({ success: false, error: validated.error })
        }

        soundPreferencesUpdates = validated.updates
    }

    type OnboardingUpdates = { goals?: string[]; starting_mode?: string; situation?: string | null }
    let onboardingUpdates: OnboardingUpdates | null = null

    if (body.goals !== undefined || body.starting_mode !== undefined || body.situation !== undefined) {
        onboardingUpdates = {}

        if (body.goals !== undefined) {
            if (!Array.isArray(body.goals) || body.goals.some((item) => typeof item !== "string")) {
                return res.status(400).json({ success: false, error: "goals must be an array of strings" })
            }

            const goals = (body.goals as string[]).map((item) => item.trim()).filter(Boolean)
            if (goals.length < 1 || goals.length > 5) {
                return res.status(400).json({ success: false, error: "goals must contain between 1 and 5 items" })
            }

            onboardingUpdates.goals = goals
        }

        if (body.starting_mode !== undefined) {
            if (!["sleep", "relax", "focus"].includes(body.starting_mode as string)) {
                return res.status(400).json({
                    success: false,
                    error: "starting_mode must be one of sleep, relax, or focus",
                })
            }

            onboardingUpdates.starting_mode = body.starting_mode as string
        }

        if (body.situation !== undefined) {
            if (body.situation !== null && typeof body.situation !== "string") {
                return res.status(400).json({ success: false, error: "situation must be a string or null" })
            }

            onboardingUpdates.situation = body.situation === null
                ? null
                : (body.situation as string).trim() || null
        }
    }

    try {
        const { data: userProfile, error: userProfileError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", req.user!.id)
            .maybeSingle()

        if (userProfileError || !userProfile) {
            console.error("Import guest data profile error:", userProfileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const userId = userProfile.id as string | number

        let favouritesAdded = 0
        let favouritesSkipped = 0

        if (favouriteIds.length > 0) {
            const uniqueFavouriteIds = [...new Set(favouriteIds)]

            const { data: liveSoundscapes, error: liveError } = await supabaseAdmin
                .from("soundscapes")
                .select("id")
                .eq("status", "live")
                .in("id", uniqueFavouriteIds)

            if (liveError) {
                console.error("Import guest data favourites lookup error:", liveError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            const liveIds = new Set((liveSoundscapes || []).map((row) => String(row.id)))

            const { data: existingFavourites, error: existingError } = await supabaseAdmin
                .from("user_favourites")
                .select("soundscape_id")
                .eq("user_id", userId)
                .in("soundscape_id", uniqueFavouriteIds)

            if (existingError) {
                console.error("Import guest data existing favourites error:", existingError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            const existingIds = new Set((existingFavourites || []).map((row) => String(row.soundscape_id)))
            const toInsert = uniqueFavouriteIds.filter((id) => liveIds.has(id) && !existingIds.has(id))
            favouritesSkipped = uniqueFavouriteIds.length - toInsert.length

            if (toInsert.length > 0) {
                const { error: insertError } = await supabaseAdmin
                    .from("user_favourites")
                    .insert(toInsert.map((soundscapeId) => ({ user_id: userId, soundscape_id: soundscapeId })))

                if (insertError) {
                    console.error("Import guest data insert favourites error:", insertError)
                    return res.status(500).json({ success: false, error: "Failed to import guest data" })
                }

                await invalidateUser(req.user!.id, ["favourites", "recommendations", "home-recommended"])
                await invalidateContent({ keys: ["collections:popular"] })
                favouritesAdded = toInsert.length
            }
        }

        let playlistsCreated = 0
        let playlistItemsSkipped = 0

        for (const playlistInput of playlistInputs) {
            const { data: playlist, error: playlistError } = await supabaseAdmin
                .from("user_playlists")
                .insert({
                    user_id: userId,
                    name: playlistInput.name,
                    description: normalizeOptionalText(playlistInput.description),
                    cover_image_url: normalizeOptionalText(playlistInput.cover_image_url),
                })
                .select("id")
                .single()

            if (playlistError) {
                console.error("Import guest data create playlist error:", playlistError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            playlistsCreated += 1

            const uniqueSoundscapeIds = [...new Set(playlistInput.soundscapeIds)]
            if (uniqueSoundscapeIds.length === 0) {
                continue
            }

            const { data: liveSoundscapes, error: liveError } = await supabaseAdmin
                .from("soundscapes")
                .select("id")
                .eq("status", "live")
                .in("id", uniqueSoundscapeIds)

            if (liveError) {
                console.error("Import guest data playlist soundscape lookup error:", liveError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            const liveIds = new Set((liveSoundscapes || []).map((row) => String(row.id)))
            const validIds = uniqueSoundscapeIds.filter((id) => liveIds.has(id))
            playlistItemsSkipped += uniqueSoundscapeIds.length - validIds.length

            if (validIds.length > 0) {
                const { error: itemsError } = await supabaseAdmin
                    .from("user_playlist_items")
                    .insert(validIds.map((soundscapeId, index) => ({
                        playlist_id: playlist.id,
                        soundscape_id: soundscapeId,
                        sort_order: index,
                    })))

                if (itemsError) {
                    console.error("Import guest data add playlist items error:", itemsError)
                    return res.status(500).json({ success: false, error: "Failed to import guest data" })
                }
            }
        }

        let preferencesApplied = false
        let preferencesNote: string | null = null

        if (soundPreferencesUpdates) {
            const { data: existingPreferences, error: existingPreferencesError } = await supabaseAdmin
                .from("user_sound_preferences")
                .select("user_id")
                .eq("user_id", userId)
                .maybeSingle()

            if (existingPreferencesError) {
                console.error("Import guest data check preferences error:", existingPreferencesError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            if (existingPreferences) {
                preferencesNote = "Sound preferences already exist for this account and were not overwritten"
            } else {
                const { error: insertPreferencesError } = await supabaseAdmin
                    .from("user_sound_preferences")
                    .upsert({
                        ...SOUND_PREFERENCE_DEFAULTS,
                        ...soundPreferencesUpdates,
                        user_id: userId,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: "user_id" })

                if (insertPreferencesError) {
                    console.error("Import guest data insert preferences error:", insertPreferencesError)
                    return res.status(500).json({ success: false, error: "Failed to import guest data" })
                }

                await invalidatePreferences(req.user!.id)
                preferencesApplied = true
            }
        }

        let onboardingApplied = false
        let onboardingNote: string | null = null

        if (onboardingUpdates) {
            const { data: existingOnboarding, error: existingOnboardingError } = await supabaseAdmin
                .from("user_onboarding")
                .select("user_id")
                .eq("user_id", userId)
                .maybeSingle()

            if (existingOnboardingError) {
                console.error("Import guest data check onboarding error:", existingOnboardingError)
                return res.status(500).json({ success: false, error: "Failed to import guest data" })
            }

            if (existingOnboarding) {
                onboardingNote = "Onboarding already exists for this account and was not overwritten"
            } else {
                const { error: insertOnboardingError } = await supabaseAdmin
                    .from("user_onboarding")
                    .upsert({
                        user_id: userId,
                        goals: onboardingUpdates.goals || [],
                        starting_mode: onboardingUpdates.starting_mode ?? null,
                        situation: onboardingUpdates.situation ?? null,
                        completed: true,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    }, { onConflict: "user_id" })

                if (insertOnboardingError) {
                    console.error("Import guest data insert onboarding error:", insertOnboardingError)
                    return res.status(500).json({ success: false, error: "Failed to import guest data" })
                }

                await invalidatePreferences(req.user!.id)
                onboardingApplied = true
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                favourites_added: favouritesAdded,
                favourites_skipped: favouritesSkipped,
                playlists_created: playlistsCreated,
                playlist_items_skipped: playlistItemsSkipped,
                preferences_applied: preferencesApplied,
                ...(preferencesNote ? { preferences_note: preferencesNote } : {}),
                onboarding_applied: onboardingApplied,
                ...(onboardingNote ? { onboarding_note: onboardingNote } : {}),
            },
        })
    } catch (err) {
        console.error("Error importing guest data:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
