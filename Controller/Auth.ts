import { invalidateUser, invalidateContent } from "../Utils/CacheHelper.ts"
import { createClient } from "@supabase/supabase-js"
import type { Request, Response } from "express"
import { supabase, supabaseAdmin, supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"
import { authError, emailIssue, nameIssue, passwordIssue, tokenIssue } from "../Utils/AuthValidation.ts"

type AuthServiceError = {
    code?: string
    message?: string
    status?: number
}

const logAuthFailure = (action: string, error: AuthServiceError) => {
    // Expected auth rejections are user-facing outcomes, so do not print their stack traces.
    if (typeof error.status === "number" && error.status < 500) {
        const message = String(error.message || error.code || "Authentication request rejected")
            .replace(/\s+/g, " ")
            .trim()
        const status = error.status
        const code = String(error.code || "unknown")
        console.warn(`[Auth] ${action}: status=${status} code=${code} message=${message}`)
        return
    }

    // Keep the complete error for unexpected/provider-side failures so they remain debuggable.
    console.error(`[Auth] ${action}:`, error)
}

const duplicateSignUpCodes = new Set(["user_already_exists", "email_exists"])

const isRateLimitError = (error: AuthServiceError) => {
    const code = String(error.code || "").toLowerCase()
    return error.status === 429 || code.includes("rate_limit")
}

const SIGNUP_RECONCILIATION_MAX_AGE_MS = 15_000
const SIGNUP_RECONCILIATION_CLOCK_SKEW_MS = 5_000

type SignUpErrorCode = Parameters<typeof authError>[2]

const sendSignUpError = (
    res: Response,
    status: number,
    code: SignUpErrorCode,
    message: string,
    details?: Record<string, string>,
) => authError(res, status, code, message, details)

const getBearerToken = (req: Request) => {
    const authHeader = String(req.headers.authorization || "").trim()
    const match = authHeader.match(/^Bearer\s+(\S+)$/i)
    if (!match) {
        return null
    }
    return match[1]
}

const createAuthClient = (token: string) =>
    createClient(supabaseUrlValue, supabaseAnonKeyValue, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    })

/**
 * A throwaway client for a single session-changing auth call (sign-in, sign-up,
 * refresh, re-auth). The shared module-level `supabase` client single-flights
 * refreshes per instance, so two users refreshing within the same window could
 * both receive the FIRST user's new session — a silent cross-account takeover
 * (audit C-1). A fresh instance per request shares no in-flight or in-memory
 * session state.
 */
const createEphemeralAuthClient = () =>
    createClient(supabaseUrlValue, supabaseAnonKeyValue, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    })

/**
 * Supabase access tokens carry an `amr` (authentication methods reference)
 * claim listing how the session was obtained. A password-reset link produces a
 * `recovery` (or `otp`) session; a normal sign-in produces `password`/`oauth`.
 * `/reset-password` must only accept the former, or any valid access token
 * could set a new password with no other proof (audit H-1). The token has
 * already been validated with Supabase by the caller, so the payload is
 * decoded here only to read its claims, not to establish trust.
 */
const tokenIsRecoverySession = (token: string): boolean => {
    try {
        const payload = token.split(".")[1]
        if (!payload) return false
        const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
        const claims = JSON.parse(json) as { amr?: Array<{ method?: string }> }
        if (!Array.isArray(claims.amr)) return false
        return claims.amr.some((entry) => entry?.method === "recovery" || entry?.method === "otp")
    } catch {
        return false
    }
}

const rejectAuthenticatedRequest = async (req: Request, res: Response) => {
    const authHeader = String(req.headers.authorization || "").trim()
    if (!authHeader) {
        return false
    }

    const token = getBearerToken(req)
    if (!token) {
        authError(res, 401, "INVALID_AUTH_HEADER", "Authorization header must use the Bearer token format")
        return true
    }

    const { data } = await createAuthClient(token).auth.getUser()
    if (!data.user) {
        return false
    }

    authError(res, 409, "ALREADY_AUTHENTICATED", "You are already signed in. Log out before signing in or creating another account")
    return true
}

export const SignUp = async (req: Request, res: Response) => {
    const { email, password, username, emailRedirectTo } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()
    const cleanUsername = String(username || "").trim()
    const cleanEmailRedirectTo = String(emailRedirectTo || "").trim()

    const details: Record<string, string> = {}
    const invalidEmail = emailIssue(email)
    const invalidPassword = passwordIssue(password, "password", true)
    const invalidUsername = nameIssue(username, "username", 2)
    if (invalidEmail) details.email = invalidEmail
    if (invalidPassword) details.password = invalidPassword
    if (invalidUsername) details.username = invalidUsername
    if (Object.keys(details).length) {
        return sendSignUpError(res, 400, "VALIDATION_ERROR", "Please provide valid signup details", details)
    }

    try {
        if (await rejectAuthenticatedRequest(req, res)) return

        const { data: existingProfile, error: lookupError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("email", cleanEmail)
            .maybeSingle()

        if (lookupError) {
            console.error("Signup email lookup error:", lookupError)
            return sendSignUpError(res, 500, "DATABASE_ERROR", "Unable to verify whether this email is already registered")
        }
        if (existingProfile) {
            return sendSignUpError(res, 409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists")
        }

        const signUpStartedAt = Date.now()
        const { data, error } = await createEphemeralAuthClient().auth.signUp({
            email: cleanEmail,
            password,
            options: {
                emailRedirectTo: cleanEmailRedirectTo || undefined,
                data: {
                    username: cleanUsername,
                    name: cleanUsername,
                    full_name: cleanUsername,
                    display_name: cleanUsername,
                },
            },
        })


        if (error) {
            logAuthFailure("Sign-up failed", error)
            const errorCode = String(error.code || "").toLowerCase()

            if (duplicateSignUpCodes.has(errorCode)) {
                return sendSignUpError(res, 409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists")
            }

            if (isRateLimitError(error)) {
                return sendSignUpError(
                    res,
                    429,
                    "RATE_LIMITED",
                    "Too many signup or confirmation-email attempts. Please wait before trying again",
                )
            }

            return sendSignUpError(res, 400, "AUTH_ERROR", error.message || "Unable to create account")
        }

        // Supabase can hide duplicate signups by returning a fake user with no identities.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            return sendSignUpError(res, 409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists")
        }

        // A successful signup response without a user is not proof of a duplicate.
        if (!data.user) {
            const { data: adminUsersData, error: adminUsersError } = await supabaseAdmin.auth.admin.listUsers({
                page: 1,
                perPage: 50,
            })
            const reconciliationCheckedAt = Date.now()
            const matchingAuthUser = (adminUsersData?.users || []).find(
                (user) => String(user.email || "").trim().toLowerCase() === cleanEmail,
            ) || null
            const matchingUserCreatedAtMs = matchingAuthUser
                ? Date.parse(String(matchingAuthUser.created_at || ""))
                : Number.NaN
            const matchingUserIsJustCreated = Boolean(
                matchingAuthUser
                && Number.isFinite(matchingUserCreatedAtMs)
                && matchingUserCreatedAtMs >= signUpStartedAt - SIGNUP_RECONCILIATION_CLOCK_SKEW_MS
                && matchingUserCreatedAtMs <= reconciliationCheckedAt + SIGNUP_RECONCILIATION_CLOCK_SKEW_MS
                && reconciliationCheckedAt - matchingUserCreatedAtMs <= SIGNUP_RECONCILIATION_MAX_AGE_MS
            )

            if (matchingAuthUser && matchingUserIsJustCreated) {
                const metadata = matchingAuthUser.user_metadata || {}
                const profileName = String(
                    metadata.name
                    || metadata.username
                    || metadata.full_name
                    || metadata.display_name
                    || cleanUsername
                ).trim() || cleanUsername
                const { error: profileError } = await supabaseAdmin
                    .from("users")
                    .upsert({
                        auth_user_id: matchingAuthUser.id,
                        email: matchingAuthUser.email || cleanEmail,
                        name: profileName,
                        is_verified: Boolean(matchingAuthUser.email_confirmed_at || matchingAuthUser.confirmed_at),
                        last_sign_in_at: matchingAuthUser.last_sign_in_at || null,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: "auth_user_id" })

                if (profileError) {
                    console.error("[Auth] Sign-up reconciliation profile sync failed:", profileError)
                    return sendSignUpError(
                        res,
                        500,
                        "DATABASE_ERROR",
                        "The account was created, but its app profile could not be synchronized",
                    )
                }

                return res.status(201).json({
                    success: true,
                    data: {
                        auth: { user: matchingAuthUser, session: data.session },
                    },
                })
            }

            console.error("[Auth] Sign-up failed: Supabase returned no user and follow-up found no just-created account", {
                followUpLookupError: adminUsersError ? {
                    status: adminUsersError.status,
                    code: adminUsersError.code,
                    message: adminUsersError.message,
                } : null,
            })
            return sendSignUpError(res, 502, "AUTH_ERROR", "The authentication service did not create the account. Please try again")
        }

        return res.status(201).json({ success: true, data: { auth: data } })
    } catch (err) {
        console.error("Error signing up:", err)
        return sendSignUpError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const SignIn = async (req: Request, res: Response) => {
    const { email, password } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()

    const details: Record<string, string> = {}
    const invalidEmail = emailIssue(email)
    const invalidPassword = passwordIssue(password, "password", false)
    if (invalidEmail) details.email = invalidEmail
    if (invalidPassword) details.password = invalidPassword
    if (Object.keys(details).length) {
        return authError(res, 400, "VALIDATION_ERROR", "Please provide a valid email and password", details)
    }

    try {
        if (await rejectAuthenticatedRequest(req, res)) return

        const { data, error } = await createEphemeralAuthClient().auth.signInWithPassword({
            email: cleanEmail,
            password,
        })

        if (error) {
            logAuthFailure("Sign-in failed", error)
            if (error.code === "email_not_confirmed") {
                return authError(res, 403, "EMAIL_NOT_CONFIRMED", "Please verify your email before signing in")
            }
            if (String(error.code || "").includes("rate_limit")) {
                return authError(res, 429, "RATE_LIMITED", "Too many sign-in attempts. Please try again later")
            }
            return authError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password")
        }

        if (!data.session || !data.user) {
            return authError(res, 401, "INVALID_CREDENTIALS", "Sign in failed. No valid session was created")
        }

        return res.status(200).json({ success: true, data: { session: data.session, user: data.user } })
    } catch (err) {
        console.error("Error signing in:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const SyncGoogleProfile = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: authData, error: authLookupError } = await supabaseAdmin.auth.admin.getUserById(user.id)

        if (authLookupError || !authData.user) {
            return authError(res, 404, "AUTH_USER_NOT_FOUND", "Auth user not found")
        }

        const authUser = authData.user
        const metadata = authUser.user_metadata || {}
        const email = authUser.email || ""
        const name = String(metadata.full_name || metadata.name || email.split("@")[0])
        const profileImageUrl: string | null = metadata.avatar_url || metadata.picture || null
        const authProvider = String(authUser.app_metadata?.provider || "")

        const { data: existing, error: existingError } = await supabaseAdmin
            .from("users")
            .select("name, google_image_synced")
            .eq("auth_user_id", authUser.id)
            .maybeSingle()

        if (existingError) {
            console.error("Find Google profile error:", existingError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to read user profile")
        }

        const alreadySynced = existing?.google_image_synced === true
        const generatedFallbackName = email.split("@")[0]
        const payload: Record<string, any> = {
            auth_user_id: authUser.id,
            email,
            is_verified: true,
            last_sign_in_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }

        if (authProvider === "google" && !alreadySynced) {
            payload.profile_image_url = profileImageUrl
            payload.google_image_synced = true
        }

        if (!existing?.name?.trim() || existing.name === generatedFallbackName) payload.name = name

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .upsert(payload, { onConflict: "auth_user_id" })
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, onboarding_completed, last_sign_in_at, created_at, updated_at")
            .single()

        if (profileError) {
            console.error("Sync Google profile error:", profileError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to sync profile")
        }

        return res.status(200).json({ success: true, data: { profile } })
    } catch (err) {
        console.error("Error syncing Google profile:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const GoogleSignIn = async (req: Request, res: Response) => {
    const { id_token } = req.body || {}

    const invalidToken = tokenIssue(id_token, "id_token")
    if (invalidToken) {
        return authError(res, 400, "VALIDATION_ERROR", "A valid Google ID token is required", { id_token: invalidToken })
    }

    try {
        if (await rejectAuthenticatedRequest(req, res)) return

        // A short-lived client for this Google sign-in keeps the session off the
        // shared admin client (audit C-2).
        const googleAuthClient = createEphemeralAuthClient()

        const { data, error } = await googleAuthClient.auth.signInWithIdToken({
            provider: "google",
            token: String(id_token).trim(),
        })

        if (error || !data.user) {
            if (error) logAuthFailure("Google sign-in failed", error)
            return authError(res, 401, "INVALID_TOKEN", "Invalid or expired Google token")
        }

        const authUser = data.user
        const email = authUser.email || ""
        const name =
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            email.split("@")[0]

        const { data: existingProfile, error: lookupError } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("auth_user_id", authUser.id)
            .maybeSingle()

        if (lookupError) {
            console.error("Google profile lookup error:", lookupError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to read user profile")
        }

        let profile = existingProfile

        if (!profile) {
            const { data: newProfile, error: profileError } = await supabaseAdmin
                .from("users")
                .insert({
                    auth_user_id: authUser.id,
                    email,
                    name,
                    is_verified: true,
                })
                .select("*")
                .single()

            if (profileError) {
                console.error("Google sign in profile create error:", profileError)
                return authError(res, 500, "DATABASE_ERROR", "Failed to create profile")
            }

            profile = newProfile
        }

        return res.status(200).json({
            success: true,
            data: {
                session: data.session,
                user: authUser,
                profile,
            },
        })
    } catch (err) {
        console.error("Google sign in error:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const RefreshToken = async (req: Request, res: Response) => {
    const { refresh_token } = req.body || {}
    const cleanRefreshToken = String(refresh_token || "").trim()

    const invalidToken = tokenIssue(refresh_token, "refresh_token")
    if (invalidToken) {
        return authError(res, 400, "VALIDATION_ERROR", "A valid refresh token is required", { refresh_token: invalidToken })
    }

    try {
        // Per-request client: the shared one would hand a concurrent refresher
        // the wrong user's session (audit C-1).
        const { data, error } = await createEphemeralAuthClient().auth.refreshSession({
            refresh_token: cleanRefreshToken,
        })

        if (error) {
            logAuthFailure("Session refresh failed", error)
            return authError(res, 401, "INVALID_TOKEN", "Refresh token is invalid, expired, or already used. Please sign in again")
        }

        if (!data.session || !data.user) {
            return authError(res, 401, "INVALID_TOKEN", "No valid session could be created. Please sign in again")
        }

        return res.status(200).json({
            success: true,
            data: {
                session: data.session,
                user: data.user,
            },
        })
    } catch (err) {
        console.error("Error refreshing token:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const ForgotPassword = async (req: Request, res: Response) => {
    const { email } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()

    const invalidEmail = emailIssue(email)
    if (invalidEmail) {
        return authError(res, 400, "VALIDATION_ERROR", "A valid email is required", { email: invalidEmail })
    }

    try {
        const { data: existingAccount, error: lookupError } = await supabaseAdmin
            .from("users")
            .select("id")
            .ilike("email", cleanEmail)
            .maybeSingle()

        if (lookupError) {
            console.error("Forgot password email lookup error:", lookupError)
            return authError(res, 500, "DATABASE_ERROR", "Unable to verify this email address")
        }
        if (!existingAccount) {
            return authError(res, 404, "EMAIL_NOT_REGISTERED", "No account is registered with this email address")
        }

        const redirectTo = process.env.SUPABASE_RESET_PASSWORD_URL
        const options = redirectTo ? { redirectTo } : undefined
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, options)

        if (error) {
            logAuthFailure("Password-reset request failed", error)
            if (String(error.code || "").includes("rate_limit")) {
                return authError(res, 429, "RATE_LIMITED", "Too many password reset requests. Please try again later")
            }
            return authError(res, 400, "AUTH_ERROR", error.message || "Unable to send password reset email")
        }

        return res.status(200).json({
            success: true,
            data: { message: "Password reset link has been sent to the registered email address" },
        })
    } catch (err) {
        console.error("Error in forgot password:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const ResetPassword = async (req: Request, res: Response) => {
    const { newPassword, access_token } = req.body || {}
    const cleanPassword = String(newPassword || "")
    const token = getBearerToken(req) || (typeof access_token === "string" ? access_token.trim() : "")

    const details: Record<string, string> = {}
    const invalidPassword = passwordIssue(newPassword, "newPassword", true)
    const invalidToken = tokenIssue(token, "access_token")
    if (invalidPassword) details.newPassword = invalidPassword
    if (invalidToken) details.access_token = invalidToken
    if (Object.keys(details).length) {
        return authError(res, 400, "VALIDATION_ERROR", "A valid token and new password are required", details)
    }

    try {
        const authClient = createAuthClient(token)
        const { data: tokenData, error: tokenError } = await authClient.auth.getUser()
        if (tokenError || !tokenData.user) {
            return authError(res, 401, "INVALID_TOKEN", "Password reset token is invalid or expired")
        }

        // H-1: only a recovery/OTP session may reset a password without the old
        // one. A normal access token must go through /change-password (which
        // requires the current password), so it cannot silently take over an
        // account here.
        if (!tokenIsRecoverySession(token)) {
            return authError(
                res,
                403,
                "INVALID_TOKEN",
                "This action requires a password-reset link. To change a known password, use change password instead",
            )
        }

        const { data, error } = await authClient.auth.updateUser({ password: cleanPassword })

        if (error) {
            logAuthFailure("Password reset failed", error)
            return authError(res, 400, "AUTH_ERROR", error.message || "Unable to reset password")
        }

        return res.status(200).json({ success: true, data: { user: data.user } })
    } catch (err) {
        console.error("Error resetting password:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const ChangePassword = async (req: Request, res: Response) => {
    const { oldPassword, newPassword } = req.body || {}
    const cleanOldPassword = String(oldPassword || "")
    const cleanNewPassword = String(newPassword || "")

    const details: Record<string, string> = {}
    const invalidOldPassword = passwordIssue(oldPassword, "oldPassword", false)
    const invalidNewPassword = passwordIssue(newPassword, "newPassword", true)
    if (invalidOldPassword) details.oldPassword = invalidOldPassword
    if (invalidNewPassword) details.newPassword = invalidNewPassword
    if (cleanOldPassword && cleanNewPassword && cleanOldPassword === cleanNewPassword) {
        details.newPassword = "newPassword must be different from oldPassword"
    }
    if (Object.keys(details).length) {
        return authError(res, 400, "VALIDATION_ERROR", "Please provide valid password values", details)
    }

    try {
        const user = req.user!

        if (!user.email) {
            return authError(res, 400, "AUTH_ERROR", "Password change is unavailable because this account has no email")
        }

        const { error: reauthError } = await createEphemeralAuthClient().auth.signInWithPassword({
            email: String(user.email || ""),
            password: cleanOldPassword,
        })

        if (reauthError) {
            logAuthFailure("Password re-authentication failed", reauthError)
            return authError(res, 401, "INVALID_CREDENTIALS", "Old password is incorrect")
        }

        const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password: cleanNewPassword,
        })

        if (updateError) {
            console.error("Supabase change password error:", updateError)
            return authError(res, 400, "AUTH_ERROR", updateError.message || "Unable to change password")
        }

        return res.status(200).json({ success: true, data: { user: data.user } })
    } catch (err) {
        console.error("Error changing password:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const UpdateName = async (req: Request, res: Response) => {
    const { first_name, last_name } = req.body || {}
    const cleanFirstName = String(first_name || "").trim()
    const cleanLastName = String(last_name || "").trim()

    const details: Record<string, string> = {}
    const invalidFirstName = nameIssue(first_name, "first_name")
    const invalidLastName = nameIssue(last_name, "last_name")
    if (invalidFirstName) details.first_name = invalidFirstName
    if (invalidLastName) details.last_name = invalidLastName
    if (Object.keys(details).length) {
        return authError(res, 400, "VALIDATION_ERROR", "Please provide a valid first and last name", details)
    }

    try {
        const user = req.user!
        const fullName = `${cleanFirstName} ${cleanLastName}`

        const { data: updatedProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .update({ name: fullName, updated_at: new Date().toISOString() })
            .eq("auth_user_id", user.id)
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, last_sign_in_at, created_at, updated_at")
            .maybeSingle()

        if (profileError) {
            console.error("Update name profile error:", profileError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to update user profile")
        }
        if (!updatedProfile) {
            return authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }

        const { data: updatedAuthUser, error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
                first_name: cleanFirstName,
                last_name: cleanLastName,
                full_name: fullName,
                display_name: fullName,
                username: fullName,
                name: fullName,
            },
        })

        if (authUpdateError) {
            console.error("Update name auth metadata error:", authUpdateError)
            return authError(res, 400, "AUTH_ERROR", authUpdateError.message || "Failed to update auth metadata")
        }

        return res.status(200).json({ success: true, data: { user: updatedAuthUser.user, profile: updatedProfile } })
    } catch (err) {
        console.error("Error updating name:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const RemoveProfileImage = async (req: Request, res: Response) => {
    try {
        const user = req.user!
        const { data: currentProfile, error: lookupError } = await supabaseAdmin
            .from("users")
            .select("profile_image_url")
            .eq("auth_user_id", user.id)
            .maybeSingle()

        if (lookupError) {
            console.error("Find profile image error:", lookupError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to read user profile")
        }
        if (!currentProfile) {
            return authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }
        if (!currentProfile.profile_image_url) {
            return authError(res, 404, "PROFILE_IMAGE_NOT_FOUND", "No profile image is set")
        }

        const { data: updatedProfile, error } = await supabaseAdmin
            .from("users")
            .update({
                profile_image_url: null,
                updated_at: new Date().toISOString(),
            })
            .eq("auth_user_id", user.id)
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, last_sign_in_at, created_at, updated_at")
            .maybeSingle()

        if (error) {
            console.error("Remove profile image error:", error)
            return authError(res, 500, "DATABASE_ERROR", "Failed to remove profile image")
        }
        if (!updatedProfile) {
            return authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }

        return res.status(200).json({ success: true, data: { profile: updatedProfile } })
    } catch (err) {
        console.error("Error removing profile image:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const Logout = async (req: Request, res: Response) => {
    const token = getBearerToken(req)

    if (!token) {
        return authError(res, 401, "INVALID_AUTH_HEADER", "Missing or invalid authorization token")
    }

    try {
        // H-2: a client built from only a global Authorization header has no
        // stored session, so its `signOut()` revokes nothing (zero network
        // calls). Revoke the token server-side with the admin API instead so a
        // logged-out (or stolen) refresh token actually stops working.
        const { error } = await supabaseAdmin.auth.admin.signOut(token, "global")

        if (error) {
            logAuthFailure("Logout failed", error)
            return authError(res, 401, "INVALID_TOKEN", error.message || "Unable to log out this session")
        }

        return res.status(200).json({ success: true, data: { message: "Logged out successfully" } })
    } catch (err) {
        console.error("Error logging out:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const DeleteAccount = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileLookupError } = await supabaseAdmin
            .from("users")
            .select("id")
            .eq("auth_user_id", user.id)
            .maybeSingle()

        if (profileLookupError) {
            console.error("Find user profile before delete error:", profileLookupError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to find user profile")
        }

        const deleteRows = async (table: string, column: string, value: string | number) => {
            const { error } = await supabaseAdmin
                .from(table)
                .delete()
                .eq(column, value)

            if (error) {
                console.error(`Delete ${table} error:`, error)
                throw new Error(`Failed to delete ${table}`)
            }
        }

        if (userProfile?.id) {
            const appUserId = userProfile.id
            const appUserTables = [
                "user_favourites",
                "user_play_history",
                "user_sound_preferences",
                "user_playback_settings",
                "user_notification_settings",
                "user_playlists",
                "user_player_state",
                "user_onboarding",
                "user_device_tokens",
            ]

            try {
                for (const table of appUserTables) {
                    await deleteRows(table, "user_id", appUserId)
                }
            } finally {
                // Some deletions may have committed before a later table failed.
                await invalidateUser(user.id)
                await invalidateContent({ keys: ["collections:popular"] })
            }
        }

        // Best-effort: storage cleanup failures should not block account deletion.
        try {
            const { data: avatarFiles, error: avatarListError } = await supabaseAdmin.storage
                .from("avatars")
                .list(user.id)

            if (avatarListError) {
                console.error("List avatar files before delete error:", avatarListError)
            } else if (avatarFiles && avatarFiles.length > 0) {
                const { error: avatarRemoveError } = await supabaseAdmin.storage
                    .from("avatars")
                    .remove(avatarFiles.map((file) => `${user.id}/${file.name}`))

                if (avatarRemoveError) {
                    console.error("Remove avatar files before delete error:", avatarRemoveError)
                }
            }
        } catch (avatarErr) {
            console.error("Unexpected error cleaning up avatar files:", avatarErr)
        }

        const { error: profileError } = await supabaseAdmin
            .from("users")
            .delete()
            .eq("auth_user_id", user.id)

        if (profileError) {
            console.error("Delete user profile error:", profileError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to delete user profile")
        }

        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

        if (authDeleteError) {
            console.error("Delete auth user error:", authDeleteError)
            return authError(res, 500, "AUTH_ERROR", "Failed to delete user account")
        }

        return res.status(200).json({
            success: true,
            data: { message: "Account deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting account:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Failed to delete user account data")
    }
}

export const CheckSession = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("auth_user_id", user.id)
            .maybeSingle()

        if (profileError) {
            console.error("Check session profile error:", profileError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to read user profile")
        }
        if (!userProfile) {
            return authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }

        return res.status(200).json({
            success: true,
            data: {
                valid: true,
                user: { id: user.id, email: user.email },
                profile: userProfile,
            },
        })
    } catch (err) {
        console.error("Check session error:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}

export const GetCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, onboarding_completed, last_sign_in_at, created_at, updated_at")
            .eq("auth_user_id", user.id)
            .maybeSingle()

        if (profileError) {
            console.error("Get current user profile error:", profileError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to read user profile")
        }
        if (!profile) {
            return authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }

        return res.status(200).json({ success: true, data: { user, profile } })
    } catch (err) {
        console.error("Error getting current user:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}
