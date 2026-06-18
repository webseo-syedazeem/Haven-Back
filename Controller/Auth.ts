import { createClient } from "@supabase/supabase-js"
import type { Request, Response } from "express"
import { supabase, supabaseAdmin, supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"

const getBearerToken = (req: Request) => {
    const authHeader = String(req.headers.authorization || "").trim()
    if (!authHeader.startsWith("Bearer ")) {
        return null
    }
    return authHeader.slice(7).trim()
}

const createAuthClient = (token: string) =>
    createClient(supabaseUrlValue, supabaseAnonKeyValue, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    })

export const SignUp = async (req: Request, res: Response) => {
    const { email, password, username } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()
    const cleanUsername = String(username || "").trim()

    if (!cleanEmail || !password || !cleanUsername) {
        return res.status(400).json({ error: "email, password and username are required" })
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    username: cleanUsername,
                    name: cleanUsername,
                    full_name: cleanUsername,
                    display_name: cleanUsername,
                },
            },
        })

        if (error) {
            console.error("Supabase signUp error:", error)
            return res.status(400).json({ success: false, error: error.message || error })
        }

        return res.status(200).json({ success: true, data: { auth: data } })
    } catch (err) {
        console.error("Error signing up:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SignIn = async (req: Request, res: Response) => {
    const { email, password } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()

    if (!cleanEmail || !password) {
        return res.status(400).json({ success: false, error: "email and password are required" })
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
        })

        if (error) {
            console.error("Supabase signIn error:", error)
            return res.status(401).json({ success: false, error: error.message || error })
        }

        return res.status(200).json({ success: true, data: { session: data.session, user: data.user } })
    } catch (err) {
        console.error("Error signing in:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SyncGoogleProfile = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(user.id)

        if (authError || !authData.user) {
            return res.status(404).json({ success: false, error: "Auth user not found" })
        }

        const authUser = authData.user
        const metadata = authUser.user_metadata || {}
        const email = authUser.email || ""
        const name = String(metadata.full_name || metadata.name || email.split("@")[0])
        const profileImageUrl: string | null = metadata.avatar_url || metadata.picture || null

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .upsert(
                {
                    auth_user_id: authUser.id,
                    email,
                    name,
                    is_verified: true,
                    profile_image_url: profileImageUrl,
                    last_sign_in_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "auth_user_id" }
            )
            .select("*")
            .single()

        if (profileError) {
            console.error("Sync Google profile error:", profileError)
            return res.status(500).json({ success: false, error: "Failed to sync profile" })
        }

        return res.status(200).json({ success: true, data: { profile } })
    } catch (err) {
        console.error("Error syncing Google profile:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GoogleSignIn = async (req: Request, res: Response) => {
    const { id_token } = req.body || {}

    if (!id_token) {
        return res.status(400).json({ success: false, error: "id_token is required" })
    }

    try {
        const { data, error } = await supabaseAdmin.auth.signInWithIdToken({
            provider: "google",
            token: id_token,
        })

        if (error || !data.user) {
            return res.status(401).json({ success: false, error: "Invalid Google token" })
        }

        const authUser = data.user
        const email = authUser.email || ""
        const name =
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            email.split("@")[0]

        const { data: existingProfile } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("auth_user_id", authUser.id)
            .maybeSingle()

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
                return res.status(500).json({ success: false, error: "Failed to create profile" })
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
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RefreshToken = async (req: Request, res: Response) => {
    const { refresh_token } = req.body || {}
    const cleanRefreshToken = String(refresh_token || "").trim()

    if (!cleanRefreshToken) {
        return res.status(400).json({ success: false, error: "refresh_token is required" })
    }

    try {
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: cleanRefreshToken,
        })

        if (error) {
           console.log("Refresh token already used. User needs to login again.");
            return res.status(401).json({ success: false, error: error.message || "Invalid refresh token" })
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
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ForgotPassword = async (req: Request, res: Response) => {
    const { email } = req.body || {}
    const cleanEmail = String(email || "").trim().toLowerCase()

    if (!cleanEmail) {
        return res.status(400).json({ success: false, error: "email is required" })
    }

    try {
        const redirectTo = process.env.SUPABASE_RESET_PASSWORD_URL
        const options = redirectTo ? { redirectTo } : undefined
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, options)

        if (error) {
            console.error("Supabase forgot password error:", error)
            return res.status(400).json({ success: false, error: error.message || error })
        }

        return res.status(200).json({ success: true, data: { message: "Password reset email sent" } })
    } catch (err) {
        console.error("Error in forgot password:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ResetPassword = async (req: Request, res: Response) => {
    const { newPassword, access_token } = req.body || {}
    const cleanPassword = String(newPassword || "")
    const token = getBearerToken(req) || String(access_token || "")

    if (!cleanPassword || !token) {
        return res.status(400).json({ success: false, error: "newPassword and access_token are required" })
    }

    try {
        const authClient = createAuthClient(token)
        const { data, error } = await authClient.auth.updateUser({ password: cleanPassword })

        if (error) {
            console.error("Supabase reset password error:", error)
            return res.status(400).json({ success: false, error: error.message || error })
        }

        return res.status(200).json({ success: true, data: { user: data.user } })
    } catch (err) {
        console.error("Error resetting password:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ChangePassword = async (req: Request, res: Response) => {
    const { oldPassword, newPassword } = req.body || {}
    const cleanOldPassword = String(oldPassword || "")
    const cleanNewPassword = String(newPassword || "")

    if (!cleanOldPassword || !cleanNewPassword) {
        return res.status(400).json({ success: false, error: "oldPassword and newPassword are required" })
    }

    try {
        const user = req.user!

        const { error: reauthError } = await supabase.auth.signInWithPassword({
            email: String(user.email || ""),
            password: cleanOldPassword,
        })

        if (reauthError) {
            console.error("Supabase re-authentication error:", reauthError)
            return res.status(401).json({ success: false, error: reauthError.message || "Old password is incorrect" })
        }

        const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password: cleanNewPassword,
        })

        if (updateError) {
            console.error("Supabase change password error:", updateError)
            return res.status(400).json({ success: false, error: updateError.message || updateError })
        }

        return res.status(200).json({ success: true, data: { user: data.user } })
    } catch (err) {
        console.error("Error changing password:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateName = async (req: Request, res: Response) => {
    const { first_name, last_name } = req.body || {}
    const cleanFirstName = String(first_name || "").trim()
    const cleanLastName = String(last_name || "").trim()

    if (!cleanFirstName || !cleanLastName) {
        return res.status(400).json({ success: false, error: "first_name and last_name are required" })
    }

    try {
        const user = req.user!
        const fullName = `${cleanFirstName} ${cleanLastName}`

        const { data: updatedProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .update({ name: fullName, updated_at: new Date().toISOString() })
            .eq("auth_user_id", user.id)
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, last_sign_in_at, created_at, updated_at")
            .single()

        if (profileError || !updatedProfile) {
            console.error("Update name profile error:", profileError)
            return res.status(500).json({ success: false, error: "Failed to update user profile" })
        }

        const { data: updatedAuthUser, error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
                first_name: cleanFirstName,
                last_name: cleanLastName,
                full_name: fullName,
                display_name: fullName,
                username: fullName,
                name: fullName,
            },
        })

        if (authError) {
            console.error("Update name auth metadata error:", authError)
            return res.status(400).json({ success: false, error: authError.message || authError })
        }

        return res.status(200).json({ success: true, data: { user: updatedAuthUser.user, profile: updatedProfile } })
    } catch (err) {
        console.error("Error updating name:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RemoveProfileImage = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: updatedProfile, error } = await supabaseAdmin
            .from("users")
            .update({
                profile_image_url: null,
                updated_at: new Date().toISOString(),
            })
            .eq("auth_user_id", user.id)
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, last_sign_in_at, created_at, updated_at")
            .single()

        if (error || !updatedProfile) {
            console.error("Remove profile image error:", error)
            return res.status(500).json({ success: false, error: "Failed to remove profile image" })
        }

        return res.status(200).json({ success: true, data: { profile: updatedProfile } })
    } catch (err) {
        console.error("Error removing profile image:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const Logout = async (req: Request, res: Response) => {
    const token = getBearerToken(req)

    if (!token) {
        return res.status(401).json({ success: false, error: "Missing authorization token" })
    }

    try {
        const authClient = createAuthClient(token)
        const { error } = await authClient.auth.signOut()

        if (error) {
            console.error("Supabase logout error:", error)
            return res.status(400).json({ success: false, error: error.message || error })
        }

        return res.status(200).json({ success: true, data: { message: "Logged out successfully" } })
    } catch (err) {
        console.error("Error logging out:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteAccount = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { error: profileError } = await supabaseAdmin
            .from("users")
            .delete()
            .eq("auth_user_id", user.id)

        if (profileError) {
            console.error("Delete user profile error:", profileError)
            return res.status(500).json({ success: false, error: "Failed to delete user profile" })
        }

        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

        if (authError) {
            console.error("Delete auth user error:", authError)
            return res.status(500).json({ success: false, error: "Failed to delete user account" })
        }

        return res.status(200).json({
            success: true,
            data: { message: "Account deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting account:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
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

        if (profileError || !userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        return res.status(200).json({
            success: true,
            data: {
                valid: true,
                user,
                profile: userProfile,
            },
        })
    } catch (err) {
        console.error("Check session error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id, auth_user_id, name, email, profile_image_url, is_verified, last_sign_in_at, created_at, updated_at")
            .eq("auth_user_id", user.id)
            .single()

        if (profileError) {
            console.error("Get current user profile error:", profileError)
            return res.status(200).json({ success: true, data: { user, profile: null } })
        }

        return res.status(200).json({ success: true, data: { user, profile } })
    } catch (err) {
        console.error("Error getting current user:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
