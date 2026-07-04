import { redis } from "../Config/RedisConnection.ts"

export const CacheTTL = {
    ONE_HOUR: 60 * 60,
    SIX_HOURS: 6 * 60 * 60,
    ONE_DAY: 24 * 60 * 60,
    DAILY_EASE: 26 * 60 * 60,
    USER_ID_MAP: 7 * 24 * 60 * 60,
}

export const getOrSetCache = async <T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>,
): Promise<T> => {
    const cachedValue = await redis.get(key)

    if (cachedValue) {
        console.log(`[Cache] HIT: ${key}`)
        return JSON.parse(cachedValue) as T
    }

    console.log(`[Cache] MISS: ${key}`)
    const freshValue = await fetchFn()
    await redis.set(key, JSON.stringify(freshValue), "EX", ttlSeconds)

    return freshValue
}

export const getOrSetCacheWithRevalidate = async <T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>,
): Promise<T> => {
    const cachedValue = await redis.get(key)

    if (cachedValue) {
        console.log(`[Cache] HIT: ${key}`)
        const parsedValue = JSON.parse(cachedValue) as T

        void (async () => {
            try {
                const freshValue = await fetchFn()
                await redis.set(key, JSON.stringify(freshValue), "EX", ttlSeconds)
                console.log(`[Cache] background refresh completed: ${key}`)
            } catch (err) {
                console.error(`[Cache] background refresh failed: ${key}`, err)
            }
        })()

        return parsedValue
    }

    console.log(`[Cache] MISS: ${key}`)
    const freshValue = await fetchFn()
    await redis.set(key, JSON.stringify(freshValue), "EX", ttlSeconds)

    return freshValue
}

export const getCachedUserId = async (
    authUserId: string,
    resolverFn: () => Promise<number | null>,
): Promise<number | null> => {
    const key = `user_id_map:${authUserId}`
    const cachedUserId = await redis.get(key)

    if (cachedUserId) {
        console.log(`[UserIdMap] cache HIT: ${key}`)
        return Number(cachedUserId)
    }

    console.log(`[UserIdMap] cache MISS, querying Supabase: ${key}`)
    const resolvedUserId = await resolverFn()

    if (resolvedUserId !== null && Number.isFinite(resolvedUserId)) {
        await redis.set(key, String(resolvedUserId), "EX", CacheTTL.USER_ID_MAP)
    }

    return resolvedUserId
}
