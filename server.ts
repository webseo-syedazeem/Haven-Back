import express from "express"
import "dotenv/config"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import rateLimit from "express-rate-limit"
import fs from "fs"
import path from "path"
import swaggerUi from "swagger-ui-express"
import swaggerJsdoc from "swagger-jsdoc"
import Authroutes from "./Routes/Auth.ts"
import SetupRoutes from "./Routes/Setup.ts"
import CheckinRoutes from "./Routes/Checkin.ts"
import MoodRoutes from "./Routes/Mood.ts"
import BreathingRoutes from "./Routes/Breathing.ts"
import SoundscapeRoutes from "./Routes/Soundscape.ts"
import ChecklistRoutes from "./Routes/Checklist.ts"
import GoalsRoutes from "./Routes/Goals.ts"
import FavouritesRoutes from "./Routes/Favourites.ts"
import NotificationsRoutes from "./Routes/Notifications.ts"
import TrackRoutes from "./Routes/Track.ts"
import ProgressRoutes from "./Routes/Progress.ts"
import SubscriptionRoutes from "./Routes/Subscription.ts"
import DailyEaseRoutes from "./Routes/DailyEase.ts"
import HealthConnectRoutes from "./Routes/HealthConnect.ts"

const app = express()
app.set("trust proxy", 1)
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",")
const soundscapesPath = path.join(process.cwd(), "public", "soundscapes")
const privacyPolicyPath = path.join(process.cwd(), "public", "legal", "privacy-policy.md")

// Spotify-Grade Performance: Optimized chunk size (128KB) for faster initial mobile buffering over cellular networks
const AUDIO_CHUNK_SIZE = 128 * 1024 
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
  <title>Steadia Privacy Policy</title>
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
    max: 100,
    message: { success: false, error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
})

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }))

if (process.env.NODE_ENV === "Production") {
    app.use("/api", apiLimiter)
    app.use("/api/signin", authLimiter)
    app.use("/api/signup", authLimiter)
    app.use("/api/forgot-password", authLimiter)
    app.use(express.json({ limit: "10kb" }))
    app.use(express.urlencoded({ extended: true, limit: "10kb" }))
} else {
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
}

morgan.token("time", () => {
    return new Date().toLocaleString()
})

app.use(
    morgan(
        ":time | :method :url | Status: :status | Response Time: :response-time ms"
    )
)

// ASYNC HIGH-PERFORMANCE AUDIO STREAMING ENGINE (Spotify-Style)
app.get(/^\/soundscapes\/(.+\.(?:m4a|mp3|ogg|wav))$/i, async (req, res) => {
    const relativeFilePath = req.params[0]
    const filePath = path.resolve(soundscapesPath, relativeFilePath)
    const extension = path.extname(filePath).toLowerCase()

    // 1. Path Traversal Attack Security Check
    if (!filePath.startsWith(`${soundscapesPath}${path.sep}`)) {
        return res.status(403).json({ message: "Invalid soundscape path" })
    }

    try {
        // 2. Non-blocking Async File Stats Check (Prevents Node.js Event Loop Freeze)
        const stats = await fs.promises.stat(filePath)
        const fileSize = stats.size
        const range = req.headers.range

        // Premium Streaming Headers Configured for iOS/Android AVPlayer
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
            const stream = fs.createReadStream(filePath, { highWaterMark: AUDIO_CHUNK_SIZE })
            stream.on("error", () => res.end())
            return stream.pipe(res)
        }

        // Case B: HTTP 206 Partial Content Range Requests (Seamless scrubbing/seeking)
        const parts = range.replace(/bytes=/, "").split("-")
        const startText = parts[0]
        const endText = parts[1]

        const start = startText ? parseInt(startText, 10) : Math.max(fileSize - parseInt(endText, 10), 0)
        const requestedEnd = endText && startText ? parseInt(endText, 10) : start + AUDIO_CHUNK_SIZE - 1

        if (isNaN(start) || start >= fileSize) {
            return res.status(416).set("Content-Range", `bytes */${fileSize}`).end()
        }

        const end = Math.min(requestedEnd, fileSize - 1)
        const contentLength = end - start + 1

        res.writeHead(206, {
            ...commonHeaders,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": contentLength,
        })

        // Pipe chunk safely and handle abrupt client closes (user skips or closes mobile app)
        const stream = fs.createReadStream(filePath, { start, end, highWaterMark: AUDIO_CHUNK_SIZE })
        
        req.on("close", () => {
            stream.destroy() // Closes stream immediately if user fast-forwards or skips track
        })

        stream.on("error", () => {
            if (!res.headersSent) res.sendStatus(500)
        })

        return stream.pipe(res)

    } catch (error: any) {
        if (error.code === "ENOENT") {
            return res.status(404).json({ message: "Soundscape not found" })
        }
        return res.status(500).json({ message: "Internal server error" })
    }
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
// REMOVED express.static to avoid routing middleware conflicts on "/soundscapes"

app.use("/api", Authroutes)
app.use("/api", SetupRoutes)
app.use("/api", CheckinRoutes)
app.use("/api", MoodRoutes)
app.use("/api", BreathingRoutes)
app.use("/api", SoundscapeRoutes)
app.use("/api", ChecklistRoutes)
app.use("/api", GoalsRoutes)
app.use("/api", FavouritesRoutes)
app.use("/api", NotificationsRoutes)
app.use("/api", TrackRoutes)
app.use("/api", ProgressRoutes)
app.use("/api", SubscriptionRoutes)
app.use("/api", DailyEaseRoutes)
app.use("/api", HealthConnectRoutes)
// Swagger Config
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Steadia API",
            version: "1.0.0",
            description: "Steadia API documentation",
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
        },
    },

    // VERY IMPORTANT
    apis: [
        path.resolve("server.ts"),
        path.resolve("Routes", "*.ts"),
        path.resolve("Routes", "Checkin.ts"),
    ],
}

const swaggerSpec = swaggerJsdoc(options)

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec))

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

const PORT = Number(process.env.PORT) || 3000
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000"

const server = app.listen(PORT)

server.on("listening", () => {
    console.log(`Server running on port ${SERVER_URL}`)
})

server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
        console.error(
            `Port ${PORT} is already in use. Change PORT in .env or stop the other Node process.`
        )
        process.exit(1)
    }

    throw error
})

