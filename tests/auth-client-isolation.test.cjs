/* global __dirname */
// Regression guards for the backend security audit:
//   C-1 — session-changing auth calls must use a fresh per-request client, not
//         the shared module-level one (whose per-instance refresh single-flight
//         caused cross-account token leakage).
//   H-1 — /reset-password must require a recovery/OTP session.
//   H-2 — logout must revoke server-side via the admin API.
//   H-4 — the previously-unthrottled auth routes must be rate limited.
//   M-2 — Swagger docs must not be mounted unconditionally.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const root = path.resolve(__dirname, "..")
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

test("C-1: session-changing auth calls do not use the shared supabase client", () => {
    const auth = read("Controller/Auth.ts")
    for (const call of [
        "supabase.auth.refreshSession",
        "supabase.auth.signInWithPassword",
        "supabase.auth.signUp",
        "supabase.auth.signInWithIdToken",
    ]) {
        assert.equal(auth.includes(call), false, `${call} must go through a per-request client`)
    }
    assert.match(auth, /createEphemeralAuthClient\(\)\.auth\.refreshSession/)
    assert.match(auth, /createEphemeralAuthClient\(\)\.auth\.signInWithPassword/)
    assert.match(auth, /createEphemeralAuthClient\(\)\.auth\.signUp/)
    // The ephemeral client must be non-persisting.
    assert.match(auth, /persistSession:\s*false/)
})

test("H-1: reset-password requires a recovery session", () => {
    const auth = read("Controller/Auth.ts")
    assert.match(auth, /tokenIsRecoverySession/)
    assert.match(auth, /amr/)
    // The gate must run before the password is updated.
    const gate = auth.indexOf("tokenIsRecoverySession(token)")
    const update = auth.indexOf("authClient.auth.updateUser({ password: cleanPassword })")
    assert.ok(gate > 0 && update > gate, "the recovery check must precede updateUser")
})

test("H-2: logout revokes the session with the admin API", () => {
    const auth = read("Controller/Auth.ts")
    assert.match(auth, /supabaseAdmin\.auth\.admin\.signOut\(token, "global"\)/)
})

test("H-4: formerly-unthrottled auth routes are rate limited", () => {
    const server = read("server.ts")
    for (const route of ["/api/auth/google", "/api/refresh-token", "/api/change-password"]) {
        assert.match(server, new RegExp(`app\\.use\\("${route.replace(/\//g, "\\/")}",\\s*authLimiter\\)`))
    }
})

test("M-2: swagger docs are not mounted unconditionally in production", () => {
    const server = read("server.ts")
    assert.match(server, /NODE_ENV !== "production"[\s\S]*app\.use\("\/docs"/)
})
