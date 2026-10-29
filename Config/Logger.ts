import pino from "pino"

/** Machine-searchable logs with privacy-first redaction. */
export const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
    base: { service: "passage-api", environment: process.env.NODE_ENV || "development" },
    redact: {
        paths: [
            "req.headers.authorization", "req.headers.cookie", "req.body", "res.body",
            "password", "token", "access_token", "refresh_token",
        ],
        censor: "[REDACTED]",
    },
})

