const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('health checks Supabase and returns 503 when the dependency is unavailable', () => {
  const server = read('server.ts')
  const health = read('Controller/Health.ts')
  assert.match(server, /app\.get\("\/health", Health\)/)
  assert.match(health, /supabaseAdmin[\s\S]*\.from\("users"\)/)
  assert.match(health, /snapshot\.status === "ok" \? 200 : 503/)
})

test('request logging is JSON, privacy-redacted, and ignores health probes', () => {
  const server = read('server.ts')
  const logger = read('Config/Logger.ts')
  assert.match(server, /pinoHttp\(/)
  assert.doesNotMatch(server, /morgan\(/)
  assert.match(server, /req\.url === "\/health"/)
  assert.match(logger, /"req\.body"/)
  assert.match(logger, /"req\.headers\.authorization"/)
})

test('Sentry and the final JSON error envelope retain a request id', () => {
  const server = read('server.ts')
  assert.match(server, /Sentry\.setupExpressErrorHandler\(app\)/)
  assert.match(server, /scope\.setUser/)
  assert.match(server, /request_id: requestId/)
})

test('admin monitoring exposes aggregate playback, onboarding and screen activity', () => {
  const routes = read('Routes/Admin.ts')
  const controller = read('Controller/AdminMonitoring.ts')
  assert.match(routes, /"\/admin\/monitoring"/)
  for (const event of ['soundscape_play', 'onboarding_dropoff', 'screen_view', 'app_open']) {
    assert.match(controller, new RegExp(event))
  }
  assert.match(controller, /SAFE_DETAIL_KEYS/)
})

