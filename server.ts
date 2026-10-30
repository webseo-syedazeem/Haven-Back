import express from "express"
import type { NextFunction, Request, Response } from "express"
import "./instrument.ts"
import "dotenv/config"
import cors from "cors"
import helmet from "helmet"
import { pinoHttp } from "pino-http"
import { randomUUID } from "crypto"
import rateLimit from "express-rate-limit"
import fs from "fs"
import path from "path"
import swaggerUi from "swagger-ui-express"
import swaggerJsdoc from "swagger-jsdoc"
import Authroutes from "./Routes/Auth.ts"
import SoundscapeRoutes from "./Routes/Soundscape.ts"
import FavouritesRoutes from "./Routes/Favourites.ts"
import PlaylistsRoutes from "./Routes/Playlists.ts"
import PlayHistoryRoutes from "./Routes/PlayHistory.ts"
import PreferencesRoutes from "./Routes/Preferences.ts"
import NotificationsRoutes from "./Routes/Notifications.ts"
import SupportRoutes from "./Routes/Support.ts"
import AccountRoutes from "./Routes/Account.ts"
import AdminRoutes from "./Routes/Admin.ts"
import AnalyticsRoutes from "./Routes/Analytics.ts"
import PlayerRoutes from "./Routes/Player.ts"
import HomeRoutes from "./Routes/Home.ts"
import RecommendationsRoutes from "./Routes/Recommendations.ts"
import OnboardingRoutes from "./Routes/Onboarding.ts"
import HelpRoutes from "./Routes/Help.ts"
import { connectRedis } from "./Config/RedisConnection.ts"
import { parseAudioByteRange } from "./Utils/AudioRange.ts"
import { Sentry } from "./instrument.ts"
import { logger } from "./Config/Logger.ts"
import { Health } from "./Controller/Health.ts"

const app = express()
app.set("trust proxy", 1)
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",")
const soundscapesPath = path.join(process.cwd(), "public", "soundscapes")
const previewsPath = path.join(process.cwd(), "public", "previews")
const privacyPolicyPath = path.join(process.cwd(), "public", "legal", "privacy-policy.md")
const adminPanelPath = path.join(process.cwd(), "public", "admin", "index.html")

// Files are read in bounded pieces, but this is only the server-side I/O buffer.
// It must never cap an open-ended HTTP Range response from a media player.
const AUDIO_STREAM_BUFFER_SIZE = 512 * 1024 // Increased from 128KB to 512KB for faster buffering
const AUDIO_CONTENT_TYPES: Record<string, string> = {
    ".m4a": "audio/mp4", // AAC Standard
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}
const escapeHtml = (value: string) => {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

const renderInlineMarkdown = (value: string) => {
    return escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
}

const renderMarkdown = (markdown: string) => {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")
    const html: string[] = []
    let inList = false
    let inBlockquote = false

    const closeList = () => {
        if (inList) {
            html.push("</ul>")
            inList = false
        }
    }

    const closeBlockquote = () => {
        if (inBlockquote) {
            html.push("</blockquote>")
            inBlockquote = false
        }
    }

    for (const line of lines) {
        const trimmed = line.trim()

        if (!trimmed) {
            closeList()
            closeBlockquote()
            continue
        }

        if (/^---+$/.test(trimmed)) {
            closeList()
            closeBlockquote()
            html.push("<hr />")
            continue
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
        if (heading) {
            closeList()
            closeBlockquote()
            const level = heading[1].length
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
            continue
        }

        if (trimmed.startsWith(">")) {
            closeList()
            if (!inBlockquote) {
                html.push("<blockquote>")
                inBlockquote = true
            }
            html.push(`<p>${renderInlineMarkdown(trimmed.replace(/^>\s?/, ""))}</p>`)
            continue
        }

        const bullet = trimmed.match(/^-\s+(.+)$/)
        if (bullet) {
            closeBlockquote()
            if (!inList) {
                html.push("<ul>")
                inList = true
            }
            html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`)
            continue
        }

        closeList()
        closeBlockquote()
        html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`)
    }

    closeList()
    closeBlockquote()

    return html.join("\n")
}

const renderPrivacyPolicyPage = (markdown: string) => {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Passage Privacy Policy</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f3ee;
      --paper: #ffffff;
      --ink: #173f5f;
      --muted: #4a5565;
      --line: #e7dfd6;
      --accent: #7b61ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--muted);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 40px auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: clamp(24px, 4vw, 48px);
      box-shadow: 0 18px 50px rgba(23, 63, 95, 0.08);
    }
    h1, h2, h3, h4, h5, h6 {
      color: var(--ink);
      line-height: 1.25;
      margin: 1.6em 0 0.55em;
    }
    h1 { margin-top: 0; font-size: clamp(2rem, 5vw, 3.2rem); }
    h2 { font-size: clamp(1.35rem, 3vw, 1.85rem); border-top: 1px solid var(--line); padding-top: 1.1em; }
    p, li { font-size: 1rem; }
    ul { padding-left: 1.35rem; }
    li { margin: 0.45rem 0; }
    blockquote {
      border-left: 4px solid var(--accent);
      background: rgba(123, 97, 255, 0.08);
      margin: 1.4rem 0;
      padding: 0.8rem 1rem;
      border-radius: 0 8px 8px 0;
    }
    blockquote p { margin: 0.4rem 0; }
    hr { border: 0; border-top: 1px solid var(--line); margin: 2rem 0; }
    code {
      background: #f2eef9;
      color: var(--ink);
      border-radius: 4px;
      padding: 0.08rem 0.28rem;
    }
    strong { color: #243447; }
    @media (max-width: 640px) {
      main { margin: 16px auto; padding: 22px; }
    }
  </style>
</head>
<body>
  <main>
${renderMarkdown(markdown)}
  </main>
</body>
</html>`
}

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
}))

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { success: false, error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
})

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { success: false, error: "Too many auth attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
})

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true)
            }
            if (allowedOrigins.includes("*")) {
                return callback(null, true)
            }
            if (allowedOrigins.includes(origin)) {
                return callback(null, true)
            }
            
            return callback(new Error("Not allowed by CORS"))
        },
    })
)

if (process.env.NODE_ENV === "production") {
    app.use("/api", apiLimiter)
    app.use("/api/signin", authLimiter)
    app.use("/api/signup", authLimiter)
    app.use("/api/forgot-password", authLimiter)
    app.use("/api/reset-password", authLimiter)
    app.use(express.json({ limit: "10kb" }))
    app.use(express.urlencoded({ extended: true, limit: "10kb" }))
} else {
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
}

app.use(
    pinoHttp({
        logger,
        genReqId: (req, res) => {
            const incoming = req.headers["x-request-id"]
            const requestId = typeof incoming === "string" && incoming.trim() ? incoming.trim() : randomUUID()
            res.setHeader("X-Request-Id", requestId)
            return requestId
        },
        autoLogging: { ignore: (req) => req.url === "/health" },
        serializers: {
            req: (req) => ({ id: req.id, method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
        },
    })
)

// ASYNC HIGH-PERFORMANCE AUDIO STREAMING ENGINE (Spotify-Style)
// Shared by both the full-master route (/soundscapes/*) and the preview-clip
// route (/previews/*) — same path-traversal guard, range-request handling and
// headers, just parameterized by which base directory the file must resolve
// within.
const streamAudioFile = async (
    basePath: string,
    relativeFilePath: string,
    req: Request,
    res: Response,
    notFoundMessage: string
) => {
    const filePath = path.resolve(basePath, relativeFilePath)
    const extension = path.extname(filePath).toLowerCase()

    // 1. Path Traversal Attack Security Check
    if (!filePath.startsWith(`${basePath}${path.sep}`)) {
        return res.status(403).json({ message: "Invalid soundscape path" })
    }

    try {
        // 2. Non-blocking Async File Stats Check (Prevents Node.js Event Loop Freeze)
        const stats = await fs.promises.stat(filePath)
        const fileSize = stats.size
        const range = req.headers.range

        // Audio streaming headers configured for iOS/Android AVPlayer
        const commonHeaders = {
            "Accept-Ranges": "bytes",
            "Content-Type": AUDIO_CONTENT_TYPES[extension] || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable", // Tells mobile devices to cache safely
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "X-Accel-Buffering": "no", // Disables Nginx buffering for real-time delivery
        }

        // Case A: Full file request (If client device doesn't support ranges)
        if (!range) {
            res.writeHead(200, {
                ...commonHeaders,
                "Content-Length": fileSize,
            })
            const stream = fs.createReadStream(filePath, { highWaterMark: AUDIO_STREAM_BUFFER_SIZE })
            stream.on("error", () => res.end())
            return stream.pipe(res)
        }

        // Case B: HTTP 206 Partial Content Range Requests (Seamless scrubbing/seeking)
        const parsedRange = parseAudioByteRange(range, fileSize)
        if (!parsedRange) {
            return res.status(416).set("Content-Range", `bytes */${fileSize}`).end()
        }

        const { start, end } = parsedRange
        const contentLength = end - start + 1

        res.writeHead(206, {
            ...commonHeaders,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": contentLength,
        })

        // Pipe chunk safely and handle abrupt client closes (user skips or closes mobile app)
        const stream = fs.createReadStream(filePath, {
            start,
            end,
            highWaterMark: AUDIO_STREAM_BUFFER_SIZE,
        })

        // `request.close` also fires after a normally completed request on
        // modern Node versions, while the response may still be streaming.
        // Only an actually aborted request or prematurely closed response may
        // cancel the file read.
        const stopStream = () => {
            if (!stream.destroyed) stream.destroy()
        }
        req.once("aborted", stopStream)
        res.once("close", () => {
            if (!res.writableEnded) stopStream()
        })

        stream.on("error", () => {
            if (!res.headersSent) res.sendStatus(500)
        })

        return stream.pipe(res)

    } catch (error: any) {
        if (error.code === "ENOENT") {
            return res.status(404).json({ message: notFoundMessage })
        }
        return res.status(500).json({ message: "Internal server error" })
    }
}

// Resized cover-image variants (see lib/imageVariants.js + scripts/generate-image-variants.js).
// Each variant file is uniquely named per-upload (see Controller/AdminImageUpload.ts), so a
// changed image always gets a brand-new filename/URL instead of overwriting a cached one —
// that's what makes a full year of immutable caching safe here. These three specific-path
// mounts must stay registered BEFORE the generic originals mount below, since Express matches
// static middleware in registration order and both would otherwise match the same URLs.
const IMAGE_VARIANT_CACHE_CONTROL = {
    maxAge: '365d',
    immutable: true,
}
for (const variantDir of ['sm', 'md', 'lg']) {
    app.use(
        `/passage_soundscape_images_webp/${variantDir}`,
        express.static(
            path.join(process.cwd(), 'public', 'passage_soundscape_images_webp', variantDir),
            IMAGE_VARIANT_CACHE_CONTROL
        )
    )
}

// Original, full-size cover images — unchanged 7-day cache (not immutable, since legacy
// filenames predating the uniqueness scheme above could in principle be re-saved in place).
app.use(
    '/passage_soundscape_images_webp',
    express.static(path.join(process.cwd(), 'public', 'passage_soundscape_images_webp'), {
        maxAge: '365d',
        immutable: false,
    })
)

app.get(/^\/soundscapes\/(.+\.(?:m4a|mp3|ogg|wav))$/i, async (req, res) => {
    return streamAudioFile(soundscapesPath, req.params[0], req, res, "Soundscape not found")
})

app.get(/^\/previews\/(.+\.(?:m4a|mp3|ogg|wav))$/i, async (req, res) => {
    return streamAudioFile(previewsPath, req.params[0], req, res, "Preview not found")
})

app.get("/privacy-policy", async (_req, res) => {
    try {
        const markdown = await fs.promises.readFile(privacyPolicyPath, "utf8")
        res.status(200).type("html").send(renderPrivacyPolicyPage(markdown))
    } catch (error: any) {
        if (error.code === "ENOENT") {
            return res.status(404).json({ message: "Privacy policy not found" })
        }
        return res.status(500).json({ message: "Internal server error" })
    }
})

app.get("/privacy-policy.md", async (_req, res) => {
    try {
        res.status(200).type("text/markdown").send(await fs.promises.readFile(privacyPolicyPath, "utf8"))
    } catch (error: any) {
        if (error.code === "ENOENT") {
            return res.status(404).json({ message: "Privacy policy not found" })
        }
        return res.status(500).json({ message: "Internal server error" })
    }
})

app.get("/admin", (_req, res) => {
    res.sendFile(adminPanelPath)
})
// REMOVED express.static to avoid routing middleware conflicts on "/soundscapes"

app.use("/api", Authroutes)
app.use("/api", SoundscapeRoutes)
app.use("/api", FavouritesRoutes)
app.use("/api", PlaylistsRoutes)
app.use("/api", PlayHistoryRoutes)
app.use("/api", PreferencesRoutes)
app.use("/api", NotificationsRoutes)
app.use("/api", SupportRoutes)
app.use("/api", AccountRoutes)
app.use("/api", AnalyticsRoutes)
app.use("/api", PlayerRoutes)
app.use("/api", HomeRoutes)
app.use("/api", RecommendationsRoutes)
app.use("/api", OnboardingRoutes)
app.use("/api", HelpRoutes)
app.use("/api", AdminRoutes)
// Swagger Config
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Passage API",
            version: "1.0.0",
            description: "Passage API documentation",
        },
        servers: [
            {
                url: process.env.SERVER_URL || "http://localhost:3000",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
            schemas: {
                Soundscape: {
                    type: "object",
                    description: "A soundscape catalogue row, as returned by the public and admin soundscape endpoints.",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        catalogue_ref: { type: "string", nullable: true },
                        mode: { type: "string", enum: ["sleep", "relax", "focus"] },
                        subcategory: { type: "string" },
                        title: { type: "string" },
                        short_title: { type: "string", nullable: true },
                        one_line_description: { type: "string", nullable: true },
                        detail_description: { type: "string", nullable: true },
                        colour: { type: "string", nullable: true, pattern: "^#[0-9A-Fa-f]{6}$", example: "#326C82" },
                        designed_for: { type: "string", nullable: true },
                        best_use: { type: "string", nullable: true },
                        artwork_url: { type: "string", nullable: true },
                        contains: { type: "array", items: { type: "string" } },
                        does_not_contain: { type: "array", items: { type: "string" } },
                        animals: { type: "array", items: { type: "string" } },
                        instruments: { type: "array", items: { type: "string" } },
                        human_presence: { type: "boolean" },
                        perspective: { type: "string", nullable: true },
                        movement: { type: "string", nullable: true },
                        intensity: { type: "integer", nullable: true, minimum: 1, maximum: 5 },
                        detail_level: { type: "string", nullable: true, enum: ["minimal", "gentle", "balanced", "rich"] },
                        sound_sources: { type: "array", items: { type: "string" } },
                        primary_sound_family: { type: "string", nullable: true, description: "Tag Dictionary \"Sound Family\" group value, snake_case (e.g. rail, vessels, aircraft, running_water, birds, rain)." },
                        exact_environment: { type: "string", nullable: true },
                        time_of_day: { type: "string", nullable: true },
                        weather: { type: "string", nullable: true },
                        setting_type: { type: "string", nullable: true },
                        rain_led: { type: "boolean" },
                        wind_led: { type: "boolean" },
                        wind_driven_foliage: { type: "boolean" },
                        master_version: { type: "integer" },
                        loudness_lufs: { type: "number", nullable: true },
                        duration_seconds: { type: "integer", nullable: true },
                        is_loop: { type: "boolean" },
                        qa_passed_at: { type: "string", format: "date-time", nullable: true },
                        qa_reviewer: { type: "string", nullable: true },
                        rights_status: { type: "string", nullable: true },
                        status: {
                            type: "string",
                            enum: ["idea", "briefed", "generating", "editing", "audio_qa", "metadata_qa", "app_qa", "live", "on_hold"],
                        },
                        file_url: {
                            type: "string",
                            nullable: true,
                            description: "URL to the full 1-hour master audio file.",
                        },
                        preview_url: {
                            type: "string",
                            nullable: true,
                            description: "URL to a short (~1 minute) preview clip, manually cut and uploaded alongside file_url. Null until a preview has been uploaded for this soundscape — fall back to streaming file_url when null.",
                        },
                        file_size_bytes: { type: "integer", nullable: true },
                        search_keywords: { type: "array", items: { type: "string" } },
                        sort_score: { type: "integer" },
                        release_date: { type: "string", format: "date", nullable: true },
                        science_label: { type: "string", nullable: true },
                        science_note: { type: "string", nullable: true },
                        version_of: { type: "string", format: "uuid", nullable: true },
                        created_at: { type: "string", format: "date-time" },
                        updated_at: { type: "string", format: "date-time" },
                    },
                },
            },
        },
    },

    // VERY IMPORTANT
    apis: [
        path.resolve("server.ts"),
        path.resolve("Routes", "*.ts"),
    ],
}

const swaggerSpec = swaggerJsdoc(options)

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.get("/health", Health)

/**
 * @swagger
 * /:
 *   get:
 *     summary: Home API
 *     description: This API checks server status
 *     responses:
 *       200:
 *         description: Server is running successfully
 */
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Server is running",
    })
})

app.use((req, res) => {
    res.status(404).json({ success: false, error: "Route not found", code: "NOT_FOUND" })
})

Sentry.setupExpressErrorHandler(app)
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = String(req.id || res.getHeader("X-Request-Id") || randomUUID())
    Sentry.withScope((scope) => {
        scope.setTag("request_id", requestId)
        if (req.user?.id) scope.setUser({ id: req.user.id })
        Sentry.captureException(error)
    })
    req.log?.error({ err: error, requestId }, "Unhandled request error")
    if (res.headersSent) return
    res.status(500).json({
        success: false,
        error: "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
        request_id: requestId,
    })
})

const PORT = Number(process.env.PORT) || 3000
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000"

const startServer = async () => {
    try {
        await connectRedis()
        logger.info("Redis startup check completed")
    } catch (error: any) {
        logger.fatal({ err: error }, "Unable to connect to Redis before server startup")
        process.exit(1)
    }

    const server = app.listen(PORT)

    server.on("listening", () => {
        logger.info({ port: PORT, serverUrl: SERVER_URL }, "Server listening")
    })

    server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
            logger.fatal({ port: PORT }, "Port is already in use")
            process.exit(1)
        }

        throw error
    })
}

startServer()
