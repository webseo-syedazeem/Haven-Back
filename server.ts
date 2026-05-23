import express from "express"
import "dotenv/config"
import cors from "cors"
import morgan from "morgan"
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

const app = express()
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",")
const soundscapesPath = path.join(process.cwd(), "public", "soundscapes")

// Spotify-Grade Performance: Optimized chunk size (128KB) for faster initial mobile buffering over cellular networks
const AUDIO_CHUNK_SIZE = 128 * 1024 
const AUDIO_CONTENT_TYPES: Record<string, string> = {
    ".m4a": "audio/mp4", // AAC Standard
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true)
            }
            return callback(new Error("Not allowed by CORS"))
        },
    })
)
app.use("/api/subscription/webhook", express.raw({ type: "application/json" }))
app.use(express.json())

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

// Swagger Config
const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Haven API",
            version: "1.0.0",
            description: "Haven API documentation",
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
