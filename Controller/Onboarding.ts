import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { SOUND_PREFERENCE_DEFAULTS, validateSoundPreferencesBody } from "./Preferences.ts"

const STARTING_MODES = ["sleep", "relax", "focus"] as const
const MIN_GOALS = 1
const MAX_GOALS = 5

type StartingMode = (typeof STARTING_MODES)[number]

const isStartingMode = (value: unknown): value is StartingMode => {
    return STARTING_MODES.includes(value as StartingMode)
}

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const getRequestBody = (req: Request): Record<string, unknown> => {
    return isObject(req.body) ? req.body : {}
}

const validateGoals = (value: unknown): { value: string[]; error?: string } => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return { value: [], error: "goals must be an array of strings" }
    }

    const goals = value.map((item) => item.trim()).filter(Boolean)

    if (goals.length < MIN_GOALS || goals.length > MAX_GOALS) {
        return { value: goals, error: `goals must contain between ${MIN_GOALS} and ${MAX_GOALS} items` }
    }

    return { value: goals }
}

const getAppUserId = async (req: Request, res: Response): Promise<string | number | null> => {
    const { data: userProfile, error: userProfileError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", req.user!.id)
        .maybeSingle()

    if (userProfileError) {
        console.error("Find user profile for onboarding error:", userProfileError)
        res.status(500).json({ success: false, error: "Failed to find user profile" })
        return null
    }

    if (!userProfile) {
        res.status(401).json({ success: false, error: "User profile not found" })
        return null
    }

    return userProfile.id as string | number
}

// Preference fields ride along in the same onboarding payload but belong in
// user_sound_preferences. `environment` is the onboarding-step field name for
// what user_sound_preferences stores as `preferred_environments`.
const extractPreferencesInput = (body: Record<string, unknown>): Record<string, unknown> => {
    const input: Record<string, unknown> = {}

    if (Object.prototype.hasOwnProperty.call(body, "preferred_environments")) {
        input.preferred_environments = body.preferred_environments
    } else if (Object.prototype.hasOwnProperty.call(body, "environment")) {
        input.preferred_environments = body.environment
    }

    for (const field of [
        "preferred_sounds",
        "preferred_animals",
        "preferred_instruments",
        "excluded_sounds",
        "detail_preference",
        "typical_duration",
    ] as const) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            input[field] = body[field]
        }
    }

    return input
}

export const PostOnboarding = async (req: Request, res: Response) => {
    const body = getRequestBody(req)

    const goals = validateGoals(body.goals)
    if (goals.error) {
        return res.status(400).json({ success: false, error: goals.error })
    }

    if (!isStartingMode(body.starting_mode)) {
        return res.status(400).json({ success: false, error: "starting_mode must be one of sleep, relax, or focus" })
    }

    let situation: string | null = null
    if (Object.prototype.hasOwnProperty.call(body, "situation") && body.situation !== null) {
        if (typeof body.situation !== "string") {
            return res.status(400).json({ success: false, error: "situation must be a string or null" })
        }
        situation = body.situation.trim() || null
    }

    const preferencesValidated = validateSoundPreferencesBody(extractPreferencesInput(body))
    if (preferencesValidated.error) {
        return res.status(400).json({ success: false, error: preferencesValidated.error })
    }

    try {
        const userId = await getAppUserId(req, res)
        if (userId === null) {
            return
        }

        const { data: onboarding, error: onboardingError } = await supabaseAdmin
            .from("user_onboarding")
            .upsert({
                user_id: userId,
                goals: goals.value,
                starting_mode: body.starting_mode,
                situation,
                completed: true,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" })
            .select("*")
            .single()

        if (onboardingError) {
            console.error("Upsert onboarding error:", onboardingError)
            return res.status(500).json({ success: false, error: "Failed to save onboarding" })
        }

        let preferences: Record<string, unknown> | null = null

        if (Object.keys(preferencesValidated.updates).length > 0) {
            const { data: existingPreferences, error: existingPreferencesError } = await supabaseAdmin
                .from("user_sound_preferences")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle()

            if (existingPreferencesError) {
                console.error("Find sound preferences for onboarding error:", existingPreferencesError)
                return res.status(500).json({ success: false, error: "Failed to save onboarding preferences" })
            }

            const { data: updatedPreferences, error: preferencesError } = await supabaseAdmin
                .from("user_sound_preferences")
                .upsert({
                    ...SOUND_PREFERENCE_DEFAULTS,
                    ...(existingPreferences || {}),
                    ...preferencesValidated.updates,
                    user_id: userId,
                    updated_at: new Date().toISOString(),
                }, { onConflict: "user_id" })
                .select("*")
                .single()

            if (preferencesError) {
                console.error("Upsert onboarding preferences error:", preferencesError)
                return res.status(500).json({ success: false, error: "Failed to save onboarding preferences" })
            }

            preferences = updatedPreferences
        } else {
            const { data: currentPreferences, error: currentPreferencesError } = await supabaseAdmin
                .from("user_sound_preferences")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle()

            if (currentPreferencesError) {
                console.error("Get onboarding preferences error:", currentPreferencesError)
                return res.status(500).json({ success: false, error: "Failed to save onboarding" })
            }

            preferences = currentPreferences || {
                user_id: userId,
                ...SOUND_PREFERENCE_DEFAULTS,
                updated_at: null,
            }
        }

        return res.status(200).json({ success: true, data: { onboarding, preferences } })
    } catch (err) {
        console.error("Error saving onboarding:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOnboarding = async (req: Request, res: Response) => {
    try {
        const userId = await getAppUserId(req, res)
        if (userId === null) {
            return
        }

        const { data: onboarding, error: onboardingError } = await supabaseAdmin
            .from("user_onboarding")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle()

        if (onboardingError) {
            console.error("Get onboarding error:", onboardingError)
            return res.status(500).json({ success: false, error: "Failed to get onboarding" })
        }

        return res.status(200).json({ success: true, data: { onboarding: onboarding || null } })
    } catch (err) {
        console.error("Error getting onboarding:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
