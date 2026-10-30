import { createPrivateKey, sign } from "crypto"

/**
 * Sign in with Apple server-to-server helpers.
 *
 * App Store Guideline 5.1.1(v) requires an app that offers account deletion and
 * uses Sign in with Apple to revoke the user's Apple token on deletion. Apple's
 * /auth/revoke endpoint needs an access/refresh token obtained from the
 * authorization-code exchange — the identity token the client hands Supabase is
 * NOT revocable. So the client captures the one-time `authorizationCode` at
 * sign-in, the backend exchanges it here for a long-lived Apple refresh token,
 * stores it on the user row, and revokes that token when the account is deleted.
 *
 * All of this is gated on the Apple service credentials being configured; when
 * they are absent every function is a safe no-op so sign-in and deletion keep
 * working (deletion still removes the user — the revoke is best-effort).
 */

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
const APPLE_AUDIENCE = "https://appleid.apple.com"
const CLIENT_SECRET_TTL_SECONDS = 300

const teamId = process.env.APPLE_TEAM_ID?.trim()
const keyId = process.env.APPLE_KEY_ID?.trim()
// The Services ID (or app bundle id) configured for Sign in with Apple, i.e. the
// `aud` of the identity tokens Apple issues for this app.
const clientId = process.env.APPLE_CLIENT_ID?.trim()
const privateKeyRaw = process.env.APPLE_PRIVATE_KEY

export const isAppleRevocationConfigured = (): boolean =>
    Boolean(teamId && keyId && clientId && privateKeyRaw)

const base64url = (input: Buffer | string): string =>
    Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")

/**
 * Builds the short-lived ES256 client-secret JWT Apple requires on every
 * token/revoke call. Implemented with Node's crypto so no extra dependency is
 * needed; `dsaEncoding: "ieee-p1363"` produces the raw r||s signature JWT uses.
 */
const generateClientSecret = (): string => {
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: "ES256", kid: keyId, typ: "JWT" }
    const payload = {
        iss: teamId,
        iat: now,
        exp: now + CLIENT_SECRET_TTL_SECONDS,
        aud: APPLE_AUDIENCE,
        sub: clientId,
    }

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
    // Env stores the .p8 contents; tolerate escaped "\n" newlines.
    const privateKey = createPrivateKey({
        key: String(privateKeyRaw).replace(/\\n/g, "\n"),
        format: "pem",
    })
    const signature = sign("sha256", Buffer.from(signingInput), {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
    })

    return `${signingInput}.${base64url(signature)}`
}

/**
 * Exchanges a one-time Apple authorization code for a long-lived refresh token.
 * Returns null when Apple is not configured or the exchange fails.
 */
export const exchangeAppleAuthCode = async (code: string): Promise<string | null> => {
    if (!isAppleRevocationConfigured()) return null

    try {
        const body = new URLSearchParams({
            client_id: clientId as string,
            client_secret: generateClientSecret(),
            code,
            grant_type: "authorization_code",
        })

        const response = await fetch(APPLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        })

        if (!response.ok) {
            console.warn(`[AppleAuth] Authorization-code exchange failed: HTTP ${response.status}`)
            return null
        }

        const data = (await response.json()) as { refresh_token?: string }
        return data.refresh_token ?? null
    } catch (error) {
        console.error("[AppleAuth] Authorization-code exchange error:", error)
        return null
    }
}

/**
 * Revokes an Apple token (refresh token by default). Best-effort: returns
 * whether Apple accepted the revocation, never throws.
 */
export const revokeAppleToken = async (
    token: string,
    tokenTypeHint: "refresh_token" | "access_token" = "refresh_token"
): Promise<boolean> => {
    if (!isAppleRevocationConfigured() || !token) return false

    try {
        const body = new URLSearchParams({
            client_id: clientId as string,
            client_secret: generateClientSecret(),
            token,
            token_type_hint: tokenTypeHint,
        })

        const response = await fetch(APPLE_REVOKE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        })

        if (!response.ok) {
            console.warn(`[AppleAuth] Token revocation failed: HTTP ${response.status}`)
            return false
        }

        return true
    } catch (error) {
        console.error("[AppleAuth] Token revocation error:", error)
        return false
    }
}
