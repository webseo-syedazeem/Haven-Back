import { createHash } from "node:crypto"
import { redis } from "../Config/RedisConnection.ts"

export const CacheTTL = {
    CONTENT: 3600,
    USER: 60,
    LIBRARY: 600,
    ONE_HOUR: 60 * 60,
    SIX_HOURS: 6 * 60 * 60,
    ONE_DAY: 24 * 60 * 60,
    DAILY_EASE: 26 * 60 * 60,
    USER_ID_MAP: 7 * 24 * 60 * 60,
}

// Preserve each controller's existing HTTP error without caching error/partial data.
export class CacheReadError extends Error {
    readonly statusCode: number

    constructor(statusCode: number, message: string) {
        super(message)
        this.statusCode = statusCode
    }
}

const COMMAND_TIMEOUT_MS = 300
const GENERATION_KEY = "cache:read-generation"
const SCAN_BATCH_SIZE = 200
const pendingKeys = new Set<string>()
const pendingPatterns = new Set<string>()
const localSequences = new Map<string, bigint>()
let recovery: Promise<boolean> | null = null
let localGeneration = 0

// Prevent a read started before a write from restoring stale data after deletion,
// including across backend processes. The generation check and SET are atomic.
const SET_IF_CURRENT = `
if (redis.call('GET', KEYS[1]) or '0') == ARGV[1] then
    return redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
end
return nil
`

const command = async <T>(run: () => Promise<T>): Promise<T> => {
    // Avoid ioredis's offline queue holding HTTP requests open during reconnects.
    if (redis.status !== "ready") throw new Error("Redis is not ready")
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            run(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("Redis cache command timed out")), COMMAND_TIMEOUT_MS)
            }),
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const warn = (operation: string, error: unknown) => {
    console.warn(`[Cache] ${operation}; using database`, error instanceof Error ? error.message : error)
}

const deletePattern = async (pattern: string): Promise<void> => {
    let cursor = "0"
    do {
        const [nextCursor, keys] = await command(() =>
            redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_BATCH_SIZE)
        )
        cursor = nextCursor
        for (let offset = 0; offset < keys.length; offset += SCAN_BATCH_SIZE) {
            await command(() => redis.del(...keys.slice(offset, offset + SCAN_BATCH_SIZE)))
        }
    } while (cursor !== "0")
}

// Failed deletions stay pending. This process bypasses caching until they have
// been replayed, so reconnecting cannot resurrect pre-outage entries.
const flushInvalidations = (): Promise<boolean> => {
    if (recovery) return recovery
    recovery = (async () => {
        try {
            while (pendingKeys.size || pendingPatterns.size) {
                const keys = [...pendingKeys]
                const patterns = [...pendingPatterns]
                pendingKeys.clear()
                pendingPatterns.clear()
                try {
                    await command(() => redis.incr(GENERATION_KEY))
                    for (let offset = 0; offset < keys.length; offset += SCAN_BATCH_SIZE) {
                        await command(() => redis.del(...keys.slice(offset, offset + SCAN_BATCH_SIZE)))
                    }
                    for (const pattern of patterns) await deletePattern(pattern)
                } catch (error) {
                    keys.forEach((key) => pendingKeys.add(key))
                    patterns.forEach((pattern) => pendingPatterns.add(pattern))
                    throw error
                }
            }
            return true
        } catch (error) {
            warn("invalidation deferred", error)
            return false
        }
    })().finally(() => { recovery = null })
    return recovery
}

redis.on("ready", () => { void flushInvalidations() })

const isCacheable = (value: unknown): boolean => value !== null && value !== undefined
    && !(typeof value === "object" && "success" in value && value.success === false)

// Cache JSON DATA payloads only. Database errors propagate to the controller;
// Redis read, parse, and write failures never replace a successful database result.
export const remember = async <T>(
    key: string | null,
    ttlSeconds: number,
    fetchFn: () => Promise<T>,
    shouldCache: (value: T) => boolean = isCacheable,
): Promise<T> => {
    if (!key) return fetchFn()
    if ((recovery || pendingKeys.size || pendingPatterns.size) && !await flushInvalidations()) {
        return fetchFn()
    }

    const startedAt = localGeneration
    let generation: string | null = null
    try {
        generation = await command(() => redis.get(GENERATION_KEY)) || "0"
        const cachedValue = await command(() => redis.get(key))
        if (cachedValue !== null && startedAt === localGeneration) {
            const parsedValue = JSON.parse(cachedValue) as T
            if (isCacheable(parsedValue) && shouldCache(parsedValue)) return parsedValue
        }
    } catch (error) {
        generation = null
        warn("read failed", error)
    }

    const freshValue = await fetchFn()
    if (generation !== null && startedAt === localGeneration && isCacheable(freshValue) && shouldCache(freshValue)) {
        try {
            await command(() => redis.eval(
                SET_IF_CURRENT, 2, GENERATION_KEY, key, generation!, JSON.stringify(freshValue), String(ttlSeconds)
            ))
        } catch (error) {
            warn("write failed", error)
        }
    }
    return freshValue
}

export const getOrSetCache = remember

// Retained for compatibility. A cache hit no longer starts a database refresh.
export const getOrSetCacheWithRevalidate = remember

// Redis INCR assigns one globally unique slot even when requests reach different
// backend processes at the same time. The in-process counter keeps the endpoint
// available during a Redis outage and still serializes concurrent calls handled
// by this process.
export const nextSequence = async (key: string): Promise<bigint> => {
    try {
        const redisValue = await command(() => redis.incr(key))
        const sequence = BigInt(redisValue) - 1n
        const localNext = localSequences.get(key) || 0n
        if (sequence >= localNext) localSequences.set(key, sequence + 1n)
        return sequence
    } catch (error) {
        warn(`sequence ${key} failed`, error)
        const sequence = localSequences.get(key) || 0n
        localSequences.set(key, sequence + 1n)
        return sequence
    }
}

const escapeGlob = (value: string) => value.replace(/[\\*?\[\]]/g, "\\$&")

// Use the authenticated Supabase UUID on ALL read and write paths. Never accept
// a user id from query/body, or put guests under a shared blank/null identity.
export const userCacheKey = (userId: string | null | undefined, suffix: string): string | null => {
    if (!userId?.trim()) return null
    return `user:${encodeURIComponent(userId.trim())}:${suffix}`
}

export const invalidateContent = async ({ keys = [], patterns = [] }: {
    keys?: readonly string[]
    patterns?: readonly string[]
}): Promise<void> => {
    if (!keys.length && !patterns.length) return
    localGeneration++
    keys.forEach((key) => pendingKeys.add(key))
    patterns.forEach((pattern) => pendingPatterns.add(pattern))
    // A writer can enqueue between a completed drain and its finally handler.
    // Do not acknowledge that write until its own queued deletions are drained.
    while (await flushInvalidations()) {
        if (!pendingKeys.size && !pendingPatterns.size) break
    }
}

export const deleteByPrefix = (prefix: string): Promise<void> =>
    invalidateContent({ patterns: [`${escapeGlob(prefix)}*`] })

export const invalidateUser = async (
    userId: string | null | undefined,
    suffixes: readonly string[] = ["continue-listening", "home-recommended", "recommendations", "favourites", "play-history"],
): Promise<void> => {
    const keys = suffixes.map((suffix) => userCacheKey(userId, suffix)).filter((key): key is string => key !== null)
    await invalidateContent({ keys, patterns: keys.map((key) => `${escapeGlob(key)}:*`) })
}

export const invalidateSoundscapes = (): Promise<void> => invalidateContent({
    keys: ["explore:groups"],
    // Cover old/new modes, similarity lists and embedded soundscapes in collection
    // and user lists, including content that has just been retired.
    patterns: ["soundscapes:*", "soundscape:*", "library:*", "collections:*", "collection:*",
        "user:*:continue-listening", "user:*:home-recommended", "user:*:recommendations*",
        "user:*:favourites", "user:*:play-history"],
})

export const invalidateCollection = (collectionId: string): Promise<void> => invalidateContent({
    keys: [`collection:${collectionId.toLowerCase()}`, "explore:groups"],
    patterns: ["collections:*"],
})

export const invalidateHelp = (): Promise<void> => deleteByPrefix("help:")

export const invalidatePreferences = (userId: string | null | undefined): Promise<void> =>
    invalidateUser(userId, ["recommendations", "home-recommended", "continue-listening"])

const stableValue = (value: unknown, lowercase: boolean): unknown => {
    if (typeof value === "string") return lowercase ? value.toLowerCase() : value
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => stableValue(item, lowercase)))].sort()
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stableValue(item, lowercase)]))
    }
    return value
}

export const libraryCacheKey = (filters: Record<string, unknown>): string => {
    // SQL uses case-sensitive equality for these two fields. Preserve that
    // distinction while lowercasing ILIKE filters; never collide different results.
    const normalized = Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, stableValue(value, key !== "modes" && key !== "detail_levels")]))
    return `library:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`
}

export const getCachedUserId = (authUserId: string, resolverFn: () => Promise<number | null>): Promise<number | null> =>
    remember(`user_id_map:${authUserId}`, CacheTTL.USER_ID_MAP, resolverFn, (id) => id !== null && Number.isFinite(id))
