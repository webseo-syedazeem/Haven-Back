import express from "express"
import "dotenv/config"
import cors from "cors"
import morgan from "morgan"
import path from "path"
import swaggerUi from "swagger-ui-express"
import swaggerJsdoc from "swagger-jsdoc"
import Authroutes from "./Routes/Auth.ts"
import SetupRoutes from "./Routes/Setup.ts"
import CheckinRoutes from "./Routes/Checkin.ts"
import MoodRoutes from "./Routes/Mood.ts"
import BreathingRoutes from "./Routes/Breathing.ts"

const app = express()
const allowedCorsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000"

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || origin === allowedCorsOrigin) {
                return callback(null, true)
            }

            return callback(new Error("Not allowed by CORS"))
        },
    })
)

app.use(express.json())

morgan.token("time", () => {
    return new Date().toLocaleString()
})

app.use(
    morgan(
        ":time | :method :url | Status: :status | Response Time: :response-time ms"
    )
)

app.use("/api", Authroutes)
app.use("/api", SetupRoutes)
app.use("/api", CheckinRoutes)
app.use("/api", MoodRoutes)
app.use("/api", BreathingRoutes)

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
                url: "http://localhost:3000",
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

const server = app.listen(PORT)

server.on("listening", () => {
    console.log(`Server running on port ${PORT}`)
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
