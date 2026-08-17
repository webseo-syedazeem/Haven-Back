import type { Request, Response, NextFunction } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

export const AdminAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authUserId = req.user?.id

        if (!authUserId) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: userProfile, error: profileError } = await supabaseAdmin
            .from("users")
            .select("id, is_admin")
            .eq("auth_user_id", authUserId)
            .maybeSingle()

        if (profileError) {
            console.error("AdminAuthMiddleware profile lookup error:", profileError)
            return res.status(500).json({ success: false, error: "Internal server error" })
        }

        if (!userProfile) {
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        if (userProfile.is_admin !== true) {
            return res.status(403).json({ success: false, error: "Admin access required" })
        }

        next()
    } catch (err) {
        console.error("AdminAuthMiddleware error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
