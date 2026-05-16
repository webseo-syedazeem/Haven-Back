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

export const GetCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id, auth_user_id, name, email, is_verified, last_sign_in_at, created_at, updated_at")
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
