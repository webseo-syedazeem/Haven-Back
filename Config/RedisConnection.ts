import "dotenv/config"
import { Redis } from "ioredis"

const redisUrl = process.env.REDIS_URL
const REDIS_CONNECT_TIMEOUT_MS = 10000

if (!redisUrl) {
    console.error("Redis URL is missing in environment variables.")
    process.exit(1)
}

export const redis = new Redis(redisUrl, {
    lazyConnect: true,
    retryStrategy: (times: number) => {
        return Math.min(times * 200, 2000)
    },
})

let connectionPromise: Promise<void> | null = null

redis.on("ready", () => {
    console.log("Redis connected successfully")
})

redis.on("error", (error: Error) => {
    console.error("Redis connection error:", error.message)
})

redis.on("close", () => {
    console.warn("Redis connection closed")
})

redis.on("end", () => {
    console.warn("Redis connection ended")
})

redis.on("reconnecting", (delay: number) => {
    console.warn(`Redis reconnecting in ${delay}ms`)
})

const rejectAfterTimeout = () => {
    return new Promise<void>((_resolve, reject) => {
        setTimeout(() => {
            reject(new Error(`Redis connection timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`))
        }, REDIS_CONNECT_TIMEOUT_MS)
    })
}

export const connectRedis = async () => {
    if (redis.status === "ready") {
        return
    }

    if (!connectionPromise) {
        const initialConnection = redis.connect()
            .then(async () => {
                await redis.ping()
            })
            .then(() => undefined)

        connectionPromise = Promise.race([initialConnection, rejectAfterTimeout()])
            .catch((error: Error) => {
                connectionPromise = null
                redis.disconnect()
                console.error("Redis initial connection failed:", error.message)
                throw error
            })
    }

    await connectionPromise
}
