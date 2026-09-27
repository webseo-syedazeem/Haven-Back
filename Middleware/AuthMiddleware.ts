import type { Request, Response, NextFunction } from "express"
import { createClient } from "@supabase/supabase-js"
import { supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"
import { authError } from "../Utils/AuthValidation.ts"

declare global {
    namespace Express {
        interface Request {
            user?: import("@supabase/supabase-js").User
        }
    }
}

export const AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = String(req.headers.authorization || "").trim()

    const match = authHeader.match(/^Bearer\s+(\S+)$/i)
    if (!match) {
        return authError(res, 401, "INVALID_AUTH_HEADER", "Missing or invalid Authorization header")
    }
    const token = match[1]

    try {
        const authClient = createClient(supabaseUrlValue, supabaseAnonKeyValue, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        })

        const { data, error } = await authClient.auth.getUser()

        if (error || !data.user) {
            return authError(res, 401, "INVALID_TOKEN", "Invalid or expired access token")
        }

        req.user = data.user
        next()
    } catch (err) {
        console.error("AuthMiddleware error:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}
