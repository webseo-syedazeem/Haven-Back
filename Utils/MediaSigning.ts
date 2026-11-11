import { createHmac, timingSafeEqual } from "crypto"

/**
 * HMAC-signed, time-limited media URLs.
 *
 * The problem this solves: the full soundscape files were only reachable with an
 * `Authorization: Bearer` header. A CDN (CloudFront) strips that header, so the
 * app had to bypass the CDN and stream every byte straight from the single
 * origin — slow for anyone far from it.
 *
 * A signed URL carries its proof of access in the query string (`?exp=&sig=`)
 * instead of a header. With no header to strip, the CDN is willing to cache the
 * file at its nearest edge and serve it from there — fast everywhere — while the
 * signature still keeps the link private and self-expiring.
 *
 * The signature covers only the URL *path*, never the host, so the exact same
 * `sig` is valid whether the file is fetched through the CDN or directly from the
 * origin. That lets the origin validate on a cache miss with no secret shared
 * with the CDN and no AWS key pair involved.
 */

const secret = process.env.MEDIA_SIGNING_SECRET?.trim() ?? ""

// Where signed URLs point. Set this to the CloudFront domain
// (e.g. https://d1234.cloudfront.net) to force playback through the CDN. When
// empty, the soundscape's own stored file_url host is reused unchanged.
const cdnBase = (process.env.MEDIA_CDN_BASE_URL ?? "").trim().replace(/\/+$/, "")

// How long a freshly minted URL stays valid. Must comfortably exceed the longest
// single soundscape (~1h), because the native player attaches one URL for the
// whole stream. Six hours leaves generous margin for a paused-and-resumed track.
const DEFAULT_TTL_SECONDS = 6 * 60 * 60
const ttlSeconds =
    Number(process.env.MEDIA_URL_TTL_SECONDS) > 0
        ? Number(process.env.MEDIA_URL_TTL_SECONDS)
        : DEFAULT_TTL_SECONDS

// Round every expiry up to a coarse boundary so the signed URL stays byte-identical
// for a window. Everyone who signs the same file within the same window gets the same
// URL, so the CDN caches ONE copy and reuses it for the whole window instead of
// re-fetching from origin each time the signature rotates. 1 day matches the audio
// Cache-Control. (A leaked link is then valid for up to ~1 day.)
const BUCKET_SECONDS = 24 * 60 * 60

export function isMediaSigningConfigured(): boolean {
    return secret.length > 0
}

function base64url(buffer: Buffer): string {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function computeSignature(pathname: string, exp: number): string {
    return base64url(createHmac("sha256", secret).update(`${pathname}\n${exp}`).digest())
}

/**
 * Turns a stored file_url into a signed, CDN-friendly URL.
 *
 * Returns null when signing is not configured, or the input is not a usable URL
 * or absolute path — the caller then falls back to the raw file_url.
 */
export function signMediaUrl(fileUrl: string): { url: string; expiresAt: number } | null {
    if (!secret || typeof fileUrl !== "string" || !fileUrl.trim()) return null

    let pathname: string
    let origin: string
    try {
        const parsed = new URL(fileUrl)
        pathname = parsed.pathname
        origin = parsed.origin
    } catch {
        // Allow a bare absolute path like "/soundscapes/foo.m4a".
        if (!fileUrl.startsWith("/")) return null
        pathname = fileUrl
        origin = ""
    }

    const now = Math.floor(Date.now() / 1000)
    const exp = Math.ceil((now + ttlSeconds) / BUCKET_SECONDS) * BUCKET_SECONDS
    const sig = computeSignature(pathname, exp)

    const host = cdnBase || origin
    const query = `exp=${exp}&sig=${sig}`
    const url = `${host}${pathname}?${query}`

    return { url, expiresAt: exp }
}

/**
 * Validates the `exp`/`sig` query pair for a path. Host-independent: the same
 * signature is accepted whether the request arrived via the CDN or the origin.
 */
export function verifyMediaSignature(pathname: string, expRaw: unknown, sigRaw: unknown): boolean {
    if (!secret) return false

    const exp = Number(expRaw)
    if (!Number.isInteger(exp) || exp <= 0) return false
    if (exp < Math.floor(Date.now() / 1000)) return false // expired

    const provided = typeof sigRaw === "string" ? sigRaw : Array.isArray(sigRaw) ? String(sigRaw[0] ?? "") : ""
    if (!provided) return false

    const expected = computeSignature(pathname, exp)
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}
