import "dotenv/config"
import { Redis } from "ioredis"
import { logger } from "./Logger.ts"

const redisUrl = process.env.REDIS_URL
const REDIS_CONNECT_TIMEOUT_MS = 10000

if (!redisUrl) {
    logger.fatal("Redis URL is missing")
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
    logger.info("Redis connected successfully")
})

redis.on("error", (error: Error) => {
    logger.error({ err: error }, "Redis connection error")
})

redis.on("close", () => {
    logger.warn("Redis connection closed")
})

redis.on("end", () => {
    logger.warn("Redis connection ended")
})

redis.on("reconnecting", (delay: number) => {
    logger.warn({ delayMs: delay }, "Redis reconnecting")
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
                logger.error({ err: error }, "Redis initial connection failed")
                throw error
            })
    }

    await connectionPromise
}
