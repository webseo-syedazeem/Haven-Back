import type { Request, Response, NextFunction } from "express"
import { createClient } from "@supabase/supabase-js"
import { supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"

export const OptionalAuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = String(req.headers.authorization || "").trim()

    if (!authHeader.startsWith("Bearer ")) {
        next()
        return
    }

    const token = authHeader.slice(7).trim()

    if (!token) {
        next()
        return
    }

    try {
        const authClient = createClient(supabaseUrlValue, supabaseAnonKeyValue, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        })

        const { data, error } = await authClient.auth.getUser()

        if (!error && data.user) {
            req.user = data.user
        }
    } catch (err) {
        console.error("OptionalAuthMiddleware error:", err)
    }

    next()
}
