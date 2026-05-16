import type { Request, Response, NextFunction } from "express"
import { createClient } from "@supabase/supabase-js"
import { supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"

declare global {
    namespace Express {
        interface Request {
            user?: import("@supabase/supabase-js").User
        }
    }
}

export const AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = String(req.headers.authorization || "").trim()

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" })
    }

    const token = authHeader.slice(7).trim()

    if (!token) {
        return res.status(401).json({ success: false, error: "Missing access token" })
    }

    try {
        const authClient = createClient(supabaseUrlValue, supabaseAnonKeyValue, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        })

        const { data, error } = await authClient.auth.getUser()

        if (error || !data.user) {
            return res.status(401).json({ success: false, error: "Invalid or expired access token" })
        }

        req.user = data.user
        next()
    } catch (err) {
        console.error("AuthMiddleware error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
