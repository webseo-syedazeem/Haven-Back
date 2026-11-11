const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('catalogue routes require auth except the explicit onboarding preview', () => {
  const routes = read('Routes/Soundscape.ts');
  const registrations = [...routes.matchAll(/SoundscapeRoutes\.get\(([^\n]+)/g)].map((match) => match[1]);
  assert.ok(registrations.length >= 12);
  for (const registration of registrations) {
    if (registration.includes('/soundscapes/mode/:mode/preview')) {
      assert.doesNotMatch(registration, /AuthMiddleware/);
    } else {
      assert.match(registration, /AuthMiddleware/);
    }
  }
  assert.match(routes, /full-audio `file_url` is never included/);
  assert.match(read('Controller/Soundscape.ts'), /toPublicPreviewSoundscape/);
});

test('recommendations, support, analytics and home recommendations require auth', () => {
  for (const [file, pattern] of [
    ['Routes/Recommendations.ts', /RecommendationsRoutes\.get\("\/recommendations", AuthMiddleware/],
    ['Routes/Analytics.ts', /AnalyticsRoutes\.post\("\/analytics\/events", AuthMiddleware/],
    ['Routes/Home.ts', /HomeRoutes\.get\("\/home\/recommended", AuthMiddleware/],
  ]) assert.match(read(file), pattern);

  const support = read('Routes/Support.ts');
  for (const route of ['contact', 'report-audio-problem', 'request-soundscape', 'my-requests']) {
    assert.match(support, new RegExp(`SupportRoutes\\.(?:get|post)\\(\"/support/${route}\", AuthMiddleware`));
  }
});

test('soundscapes are gated by AudioAccessMiddleware (signed URLs only); previews are public; byte-range support intact', () => {
  const server = read('server.ts');
  // Soundscapes are gated by AudioAccessMiddleware (valid signed URL only) —
  // never left open like the public previews route.
  assert.match(server, /app\.get\(\/\^\\\/soundscapes.*AudioAccessMiddleware/);
  // Previews are public — no auth middleware on the previews route.
  assert.doesNotMatch(server, /app\.get\(\/\^\\\/previews.*AuthMiddleware/);
  // Preview clips never change in place, so browser/CDN copies stay fresh for 365 days.
  assert.match(server, /"Preview not found", "public, max-age=31536000"/);
  // Byte-range (seek/seek/background playback) support intact.
  assert.match(server, /"Accept-Ranges": "bytes"/);
  assert.match(server, /"Content-Range": `bytes/);
  assert.match(server, /res\.writeHead\(206/);
  // A signed (header-less) request is served public so the CDN edge can cache it.
  assert.match(server, /"Soundscape not found", "public, max-age=604800"/);
  // The old Bearer middleware is gone entirely.
  assert.doesNotMatch(server, /AudioAuthMiddleware/);
});

test('AudioAccessMiddleware requires a valid signature and has no Bearer fallback', () => {
  const middleware = read('Middleware/AudioAccessMiddleware.ts');
  assert.match(middleware, /verifyMediaSignature/);
  assert.match(middleware, /INVALID_SIGNATURE/);
  assert.match(middleware, /MEDIA_SIGNING_NOT_CONFIGURED/);
  // No fallback to a token-based middleware, and no reading of an auth header.
  assert.doesNotMatch(middleware, /AudioAuthMiddleware/);
  assert.doesNotMatch(middleware, /req\.headers\.authorization/i);
});

test('retired data-import endpoint is not registered', () => {
  assert.doesNotMatch(read('Routes/Account.ts'), /import-guest-data/i);
  assert.doesNotMatch(read('Controller/Account.ts'), /ImportGuestData/);
});
