# Production observability

## Environment

- `SENTRY_DSN`: Express Sentry project DSN.
- `SENTRY_ENVIRONMENT`: normally `production` or `staging`.
- `SENTRY_RELEASE`: deployed release/version.
- `SENTRY_TRACES_SAMPLE_RATE`: optional, defaults to `0.1`.
- `LOG_LEVEL`: optional Pino level, defaults to `info` in production.

## Uptime monitor

Create an HTTPS monitor in UptimeRobot or Better Stack for `https://<api-host>/health`:

- interval: 60 seconds
- expected status: HTTP 200
- alert on HTTP 503, timeout, invalid JSON, or missing `"status":"ok"`
- recovery notification: enabled
- contacts: production phone/push contact and engineering email

The endpoint returns HTTP 503 if Supabase cannot be reached within five seconds. The app
uses the same endpoint to automatically leave its service-unavailable screen after recovery.

## Privacy

Pino never records request or response bodies and redacts authentication headers and tokens.
`/health` probes are excluded from access logs. Product analytics only contains operational
dimensions used by the admin monitoring page—never check-in reflections or health answers.
