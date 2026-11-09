import type { Request, Response, NextFunction } from "express"
import { createHash } from "crypto"
import { createClient } from "@supabase/supabase-js"
import { supabaseUrlValue, supabaseAnonKeyValue } from "../Config/Dbconnection.ts"
import { authError } from "../Utils/AuthValidation.ts"
import { logger } from "../Config/Logger.ts"

// In-memory cache: SHA-256(token) → validUntil (ms epoch).
// Prevents a Supabase network round-trip on every Range request for a single
// audio stream while still bounding the trust window to 60 s (AUTH-RT-01).
const cache = new Map<string, number>()
const CACHE_TTL_MS = 60_000
const MAX_CACHE_SIZE = 500

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}

function pruneCache(): void {
    if (cache.size < MAX_CACHE_SIZE) return
    const now = Date.now()
    for (const [key, validUntil] of cache) {
        if (validUntil <= now) cache.delete(key)
    }
    // If still over the limit after expiry eviction, drop the oldest quarter.
    if (cache.size >= MAX_CACHE_SIZE) {
        const toEvict = Array.from(cache.keys()).slice(0, Math.floor(MAX_CACHE_SIZE / 4))
        for (const key of toEvict) cache.delete(key)
    }
}

/**
 * Lightweight auth guard for direct audio stream routes (/soundscapes/*).
 *
 * Validates the Bearer token on first use via Supabase getUser(), then caches
 * the result for CACHE_TTL_MS so that the many Range requests a single audio
 * stream generates do not each incur a Supabase round-trip.
 *
 * HEAD and Range requests work without special treatment — Express parses them
 * the same way, and the client must include Authorization on all of them.
 */
export const AudioAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = String(req.headers.authorization ?? "").trim()
    const match = authHeader.match(/^Bearer\s+(\S+)$/i)
    if (!match) {
        // TEMPORARY DIAGNOSTIC — remove once 401 source is identified
        const hasAuthHeader = authHeader.length > 0
        const scheme = hasAuthHeader ? authHeader.split(/\s+/)[0] ?? "" : ""
        logger.warn({
            msg: "[audio-auth-diag] 401 missing_header_or_bad_scheme",
            hasAuthHeader,
            scheme: scheme.slice(0, 20),
            tokenLength: 0,
            reason: hasAuthHeader ? "bad_scheme" : "missing_header",
            path: req.path,
            method: req.method,
        })
        res.set("WWW-Authenticate", "Bearer")
        authError(res, 401, "INVALID_AUTH_HEADER", "Authorization: Bearer <token> required for audio streams")
        return
    }
    const token = match[1]
    const tokenHash = hashToken(token)
    const now = Date.now()

    const cachedUntil = cache.get(tokenHash)
    if (cachedUntil !== undefined && cachedUntil > now) {
        next()
        return
    }

    try {
        const authClient = createClient(supabaseUrlValue, supabaseAnonKeyValue, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        })
        const { data, error } = await authClient.auth.getUser()

        if (error || !data.user) {
            cache.delete(tokenHash)
            // TEMPORARY DIAGNOSTIC — remove once 401 source is identified
            logger.warn({
                msg: "[audio-auth-diag] 401 verify_failed",
                hasAuthHeader: true,
                scheme: "Bearer",
                tokenLength: token.length,
                reason: "verify_failed",
                path: req.path,
                method: req.method,
            })
            res.set("WWW-Authenticate", "Bearer")
            authError(res, 401, "INVALID_TOKEN", "Invalid or expired access token")
            return
        }

        pruneCache()
        cache.set(tokenHash, now + CACHE_TTL_MS)
        next()
    } catch {
        authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}
