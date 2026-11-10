import type { Request, Response, NextFunction } from "express"
import { isMediaSigningConfigured, verifyMediaSignature } from "../Utils/MediaSigning.ts"
import { AudioAuthMiddleware } from "./AudioAuthMiddleware.ts"

/**
 * Gatekeeper for the direct audio routes (`/soundscapes/*`).
 *
 * Two ways in, checked in this order:
 *
 * 1. Signed URL — `?exp=&sig=` in the query string. Validated locally with no
 *    network round-trip, so the many Range requests one stream makes are cheap,
 *    and (because there is no Authorization header) the response is CDN-cacheable.
 *    A signed request is tagged on `res.locals` so the route can serve it with a
 *    public cache policy.
 *
 * 2. Bearer token — the legacy path. Kept so app builds shipped before signed
 *    URLs existed keep working. Delegates to AudioAuthMiddleware unchanged.
 *
 * When `MEDIA_SIGNING_SECRET` is unset, signing is off and every request takes
 * the Bearer path exactly as before — this middleware is then a no-op wrapper.
 */
export const AudioAccessMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const hasSignatureParams = req.query.exp !== undefined || req.query.sig !== undefined

    if (isMediaSigningConfigured() && hasSignatureParams) {
        if (verifyMediaSignature(req.path, req.query.exp, req.query.sig)) {
            res.locals.signedMediaAccess = true
            next()
            return
        }

        // A signature was offered but did not check out (tampered or expired).
        // Do not silently fall through to the Bearer path — fail clearly.
        res.set("Cache-Control", "no-store")
        res.status(403).json({
            success: false,
            error: "Invalid or expired media signature",
            code: "INVALID_SIGNATURE",
        })
        return
    }

    // No signature present → legacy authenticated-header path.
    return AudioAuthMiddleware(req, res, next)
}
