import type { Request, Response, NextFunction } from "express"
import { isMediaSigningConfigured, verifyMediaSignature } from "../Utils/MediaSigning.ts"

/**
 * Gatekeeper for the direct audio routes (`/soundscapes/*`).
 *
 * Access is granted only by a valid signed URL — `?exp=&sig=` in the query
 * string — which is validated locally with no network round-trip. Because there
 * is no Authorization header, the response is CDN-cacheable, and the signature
 * both proves access and expires on its own. A signed request is tagged on
 * `res.locals` so the route can serve it with a public cache policy.
 *
 * The app obtains these URLs from `GET /api/soundscapes/:id/stream`, which is the
 * single access path for full audio; there is no Bearer-token fallback.
 */
export const AudioAccessMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isMediaSigningConfigured()) {
        // Signing is mandatory for audio delivery; a missing secret is a server
        // misconfiguration, not a reason to serve audio unprotected.
        res.status(500).json({
            success: false,
            error: "Media signing is not configured",
            code: "MEDIA_SIGNING_NOT_CONFIGURED",
        })
        return
    }

    if (verifyMediaSignature(req.path, req.query.exp, req.query.sig)) {
        res.locals.signedMediaAccess = true
        next()
        return
    }

    res.set("Cache-Control", "no-store")
    res.status(403).json({
        success: false,
        error: "Invalid or expired media signature",
        code: "INVALID_SIGNATURE",
    })
}
