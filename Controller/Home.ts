import { remember, CacheTTL, CacheReadError, userCacheKey } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const CONTINUE_LISTENING_LIMIT = 20
const CONTINUE_LISTENING_FETCH_LIMIT = 200

type PlayHistoryRow = {
    soundscape_id: string
    position_seconds: number | null
    played_at: string
    soundscape: Record<string, unknown> | Record<string, unknown>[] | null
}

const getUserProfileId = async (authUserId: string) => {
    return supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single()
}

export const GetContinueListening = async (req: Request, res: Response) => {
    try {
        const data = await remember(userCacheKey(req.user?.id, "continue-listening"), CacheTTL.USER, async () => {
            const { data: userProfile, error: profileError } = await getUserProfileId(req.user!.id)

            if (profileError || !userProfile) {
                console.error("Get continue listening profile error:", profileError)
                throw new CacheReadError(401, "User profile not found")
            }

            const { data: rows, error: rowsError } = await supabaseAdmin
                .from("user_play_history")
                .select("soundscape_id, position_seconds, played_at, soundscape:soundscapes!inner(*)")
                .eq("user_id", userProfile.id)
                .eq("completed", false)
                .eq("soundscape.status", "live")
                .order("played_at", { ascending: false })
                .limit(CONTINUE_LISTENING_FETCH_LIMIT)

            if (rowsError) {
                console.error("Get continue listening error:", rowsError)
                throw new CacheReadError(500, "Failed to get continue listening")
            }

            const seen = new Set<string>()
            const items: Array<{
                soundscape: Record<string, unknown> | null
                position_seconds: number
                duration_seconds: number | null
                updated_at: string
            }> = []

            for (const row of (rows || []) as PlayHistoryRow[]) {
                const soundscapeId = String(row.soundscape_id)
                if (seen.has(soundscapeId)) {
                    continue
                }
                seen.add(soundscapeId)

                const soundscape = Array.isArray(row.soundscape)
                    ? row.soundscape[0] || null
                    : row.soundscape || null

                items.push({
                    soundscape,
                    position_seconds: Number(row.position_seconds) || 0,
                    duration_seconds: soundscape && typeof soundscape.duration_seconds === "number"
                        ? soundscape.duration_seconds
                        : null,
                    updated_at: row.played_at,
                })

                if (items.length >= CONTINUE_LISTENING_LIMIT) {
                    break
                }
            }

            return { items }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting continue listening:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
