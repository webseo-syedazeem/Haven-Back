import { invalidatePreferences } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { SOUND_PREFERENCE_DEFAULTS } from "./Preferences.ts"

// public.user_onboarding.mode — CHECK-constrained to exactly these three.
const ONBOARDING_MODES = ["sleep", "relax", "focus"] as const

type OnboardingMode = (typeof ONBOARDING_MODES)[number]

const isOnboardingMode = (value: unknown): value is OnboardingMode => {
    return ONBOARDING_MODES.includes(value as OnboardingMode)
}

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const getRequestBody = (req: Request): Record<string, unknown> => {
    return isObject(req.body) ? req.body : {}
}

const hasField = (body: Record<string, unknown>, field: string): boolean => {
    return Object.prototype.hasOwnProperty.call(body, field)
}

// text[] column, NOT NULL default '{}'. Omitted -> [] (the DB default), which is
// exactly what a mode that does not own the field should store.
const validateStringArray = (
    body: Record<string, unknown>,
    field: string,
): { value: string[]; error?: string } => {
    const value = body[field]

    if (value === undefined || value === null) {
        return { value: [] }
    }

    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return { value: [], error: `${field} must be an array of strings` }
    }

    return { value: value.map((item) => item.trim()).filter(Boolean) }
}

// text column, nullable. Omitted or explicitly null -> null.
const validateNullableText = (
    body: Record<string, unknown>,
    field: string,
): { value: string | null; error?: string } => {
    if (!hasField(body, field) || body[field] === null) {
        return { value: null }
    }

    if (typeof body[field] !== "string") {
        return { value: null, error: `${field} must be a string or null` }
    }

    return { value: (body[field] as string).trim() || null }
}

// target_minutes is an integer column holding PLAIN MINUTES (45), never a
// display string ("45 min"). A numeric string is accepted and coerced so a
// form-encoded client is not punished, but anything non-integral is rejected
// rather than silently truncated.
const validateTargetMinutes = (
    body: Record<string, unknown>,
): { value: number | null; error?: string } => {
    if (!hasField(body, "target_minutes") || body.target_minutes === null) {
        return { value: null }
    }

    const raw = body.target_minutes
    const parsed = typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== "" && /^-?\d+$/.test(raw.trim())
            ? Number(raw.trim())
            : Number.NaN

    if (!Number.isInteger(parsed) || parsed < 0) {
        return { value: null, error: "target_minutes must be a non-negative integer number of minutes" }
    }

    return { value: parsed }
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

/**
 * POST /api/onboarding
 *
 * Accepts the 7 fields of public.user_onboarding. `mode` is the only required
 * one — it is the only column with a CHECK constraint and the only answer every
 * flow collects. The other 6 are optional in the API precisely because each mode
 * only sends its own family:
 *
 *   focus/sleep mode_breakers[], mode_areas[], target_minutes
 *   relax       main_goal, relax_causes[], calming_moments
 *
 * The endpoint deliberately does NOT reject a field that "belongs" to another
 * mode. Which screens a mode shows is the frontend's business; this endpoint
 * persists whatever it is given and leaves everything omitted at its DB default
 * ('{}' for the text[] columns, null for the rest). Each submission is a full
 * overwrite of all 7 columns, unchanged from previous behaviour.
 *
 * Sound-catalogue preferences (preferred sounds/animals/instruments/
 * environments, excluded sounds, detail level) are NOT part of onboarding —
 * PUT /api/preferences/sound owns those. The RPC's p_preference_updates is
 * therefore always '{}' from here, so this call never touches
 * user_sound_preferences.
 */
export const PostOnboarding = async (req: Request, res: Response) => {
    const body = getRequestBody(req)

    // "What would you like help with?" — the one required field.
    if (!isOnboardingMode(body.mode)) {
        return res.status(400).json({ success: false, error: "mode must be one of sleep, relax, or focus" })
    }

    // Focus/Sleep: "What breaks your {mode}?"
    const modeBreakers = validateStringArray(body, "mode_breakers")
    if (modeBreakers.error) {
        return res.status(400).json({ success: false, error: modeBreakers.error })
    }

    // Focus/Sleep: "Where do you need it most?"
    const modeAreas = validateStringArray(body, "mode_areas")
    if (modeAreas.error) {
        return res.status(400).json({ success: false, error: modeAreas.error })
    }

    // Focus/Sleep: "How long do you usually {mode} for?"
    const targetMinutes = validateTargetMinutes(body)
    if (targetMinutes.error) {
        return res.status(400).json({ success: false, error: targetMinutes.error })
    }

    // Relax: "What's your main goal right now?"
    const mainGoal = validateNullableText(body, "main_goal")
    if (mainGoal.error) {
        return res.status(400).json({ success: false, error: mainGoal.error })
    }

    // Relax: "What's usually causing your stress?"
    const relaxCauses = validateStringArray(body, "relax_causes")
    if (relaxCauses.error) {
        return res.status(400).json({ success: false, error: relaxCauses.error })
    }

    // Relax: "When do you most need to feel calmer?"
    const calmingMoments = validateNullableText(body, "calming_moments")
    if (calmingMoments.error) {
        return res.status(400).json({ success: false, error: calmingMoments.error })
    }

    try {
        const userId = await getAppUserId(req, res)
        if (userId === null) {
            return
        }

        const completedAt = new Date().toISOString()
        const { data: savedOnboarding, error: saveError } = await supabaseAdmin.rpc(
            "save_user_onboarding_completion",
            {
                p_user_id: userId,
                p_mode: body.mode,
                p_mode_breakers: modeBreakers.value,
                p_mode_areas: modeAreas.value,
                p_target_minutes: targetMinutes.value,
                p_main_goal: mainGoal.value,
                p_relax_causes: relaxCauses.value,
                p_calming_moments: calmingMoments.value,
                p_completed_at: completedAt,
                p_preference_updates: {},
            }
        )

        if (saveError) {
            console.error("Save onboarding completion error:", saveError)
            return res.status(500).json({ success: false, error: "Failed to save onboarding" })
        }

        const saved = savedOnboarding as {
            onboarding?: Record<string, unknown>
            preferences?: Record<string, unknown> | null
        } | null
        const onboarding = saved?.onboarding
        const preferences = saved?.preferences || {
            user_id: userId,
            ...SOUND_PREFERENCE_DEFAULTS,
            updated_at: null,
        }

        if (!onboarding) {
            console.error("Save onboarding completion returned no onboarding row")
            return res.status(500).json({ success: false, error: "Failed to save onboarding" })
        }

        await invalidatePreferences(req.user!.id)

        return res.status(200).json({ success: true, data: { onboarding, preferences } })
    } catch (err) {
        console.error("Error saving onboarding:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

/**
 * GET /api/onboarding
 *
 * Straight select("*") passthrough, so the `onboarding` object is the same shape
 * POST returns: the 8 data columns plus user_id/completed/completed_at/updated_at.
 */
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

/**
 * PATCH /api/onboarding
 *
 * Lightweight "switch mode" path for an already-onboarded user, so the frontend
 * does not have to resend the whole flow just to change mode. Body is `{ mode }`
 * — the same field name POST uses. Every other column is left exactly as stored,
 * including the previous mode's family of answers; POST /api/onboarding is the
 * way to replace those.
 */
export const PatchOnboarding = async (req: Request, res: Response) => {
    const body = getRequestBody(req)

    if (!isOnboardingMode(body.mode)) {
        return res.status(400).json({ success: false, error: "mode must be one of sleep, relax, or focus" })
    }

    try {
        const userId = await getAppUserId(req, res)
        if (userId === null) {
            return
        }

        const { data: onboarding, error: updateError } = await supabaseAdmin
            .from("user_onboarding")
            .update({
                mode: body.mode,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .select("*")
            .maybeSingle()

        if (updateError) {
            console.error("Switch onboarding mode error:", updateError)
            return res.status(500).json({ success: false, error: "Failed to update mode" })
        }

        if (!onboarding) {
            return res.status(400).json({
                success: false,
                error: "Complete onboarding first via POST /api/onboarding before switching mode",
            })
        }

        await invalidatePreferences(req.user!.id)

        return res.status(200).json({ success: true, data: { onboarding } })
    } catch (err) {
        console.error("Error switching onboarding mode:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
