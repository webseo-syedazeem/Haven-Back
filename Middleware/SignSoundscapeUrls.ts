import type { Request, Response, NextFunction } from "express"
import { isMediaSigningConfigured, signMediaUrl } from "../Utils/MediaSigning.ts"

/**
 * Adds a `signed_file_url` next to every soundscape's `file_url` in the JSON
 * response, so the app can play straight from the CDN without a separate
 * `/api/soundscapes/:id/stream` round-trip to mint a signed URL first.
 *
 * The signing happens here, at response time — AFTER any server-side caching —
 * so the signature is always fresh (it never gets baked into a cached payload).
 * Only full-audio `/soundscapes/*` URLs are signed; public `/previews/*` URLs
 * are left untouched.
 */

const SOUNDSCAPE_PATH = /\/soundscapes\//
const MAX_DEPTH = 8

function addSignedUrls(node: unknown, depth: number): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return

  if (Array.isArray(node)) {
    for (const item of node) addSignedUrls(item, depth + 1)
    return
  }

  const obj = node as Record<string, unknown>
  const fileUrl = obj.file_url
  if (
    typeof fileUrl === "string" &&
    typeof obj.signed_file_url !== "string" &&
    SOUNDSCAPE_PATH.test(fileUrl)
  ) {
    const signed = signMediaUrl(fileUrl)
    if (signed) obj.signed_file_url = signed.url
  }

  for (const key of Object.keys(obj)) addSignedUrls(obj[key], depth + 1)
}

export const SignSoundscapeUrls = (_req: Request, res: Response, next: NextFunction): void => {
  if (!isMediaSigningConfigured()) return next()

  const originalJson = res.json.bind(res)
  res.json = (body: unknown) => {
    try {
        addSignedUrls(body, 0)
    } catch {
        // Never let signing block or break a response.
    }
    return originalJson(body)
  }

  next()
}
