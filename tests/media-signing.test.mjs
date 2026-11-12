import assert from 'node:assert/strict'
import test from 'node:test'

// The signing module reads its config from the environment at load time, so the
// env must be set before the (dynamic) import evaluates the module.
process.env.MEDIA_SIGNING_SECRET = 'test-secret-value-abcdefghijklmnop'
process.env.MEDIA_CDN_BASE_URL = 'https://cdn.example.net'
delete process.env.MEDIA_URL_TTL_SECONDS

const { signMediaUrl, verifyMediaSignature, isMediaSigningConfigured } = await import(
    '../dist/Utils/MediaSigning.js'
)

test('signing is reported as configured when a secret is set', () => {
    assert.equal(isMediaSigningConfigured(), true)
})

test('a freshly signed URL points at the CDN host and verifies', () => {
    const signed = signMediaUrl('https://api.passagesounds.app/soundscapes/rain.m4a')
    assert.ok(signed, 'expected a signed URL')
    assert.match(
        signed.url,
        /^https:\/\/cdn\.example\.net\/soundscapes\/rain\.m4a\?exp=\d+&sig=[A-Za-z0-9_-]+$/,
    )
    assert.ok(signed.expiresAt > Math.floor(Date.now() / 1000), 'expiry must be in the future')

    const u = new URL(signed.url)
    assert.equal(
        verifyMediaSignature(u.pathname, u.searchParams.get('exp'), u.searchParams.get('sig')),
        true,
    )
})

test('the expiry is bucketed to a coarse boundary so URLs stay shareable/cacheable', () => {
    const signed = signMediaUrl('/soundscapes/rain.m4a')
    assert.ok(signed)
    // Bucketed to a whole day (30-day bucket), so a URL stays identical for a long
    // window and the CDN reuses one cached copy.
    assert.equal(signed.expiresAt % 86400, 0, 'exp must land on a day boundary')
})

test('a bare absolute path signs and keeps the CDN host', () => {
    const signed = signMediaUrl('/soundscapes/forest.m4a')
    assert.ok(signed)
    assert.match(signed.url, /^https:\/\/cdn\.example\.net\/soundscapes\/forest\.m4a\?exp=\d+&sig=/)
})

test('a tampered path, flipped signature, or missing signature is rejected', () => {
    const signed = signMediaUrl('/soundscapes/rain.m4a')
    const u = new URL(signed.url)
    const exp = u.searchParams.get('exp')
    const sig = u.searchParams.get('sig')

    // Signature was issued for a different file.
    assert.equal(verifyMediaSignature('/soundscapes/other.m4a', exp, sig), false)
    // One flipped character in the signature.
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    assert.equal(verifyMediaSignature('/soundscapes/rain.m4a', exp, flipped), false)
    // No signature at all.
    assert.equal(verifyMediaSignature('/soundscapes/rain.m4a', exp, ''), false)
    // A non-numeric expiry.
    assert.equal(verifyMediaSignature('/soundscapes/rain.m4a', 'not-a-number', sig), false)
})

test('an elapsed expiry is rejected', () => {
    // Any timestamp in the past fails before the signature is even considered.
    assert.equal(verifyMediaSignature('/soundscapes/rain.m4a', 1, 'anything'), false)
})
