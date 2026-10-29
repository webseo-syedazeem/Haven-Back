import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const startedAt = new Date()
const HEALTH_TIMEOUT_MS = 5_000

export type HealthSnapshot = {
    status: "ok" | "unavailable"
    service: "passage-api"
    timestamp: string
    uptime_seconds: number
    started_at: string
    checks: {
        api: { status: "ok" }
        supabase: { status: "ok" | "error"; latency_ms: number; error?: string }
    }
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
    const checkedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    let supabaseStatus: HealthSnapshot["checks"]["supabase"]

    try {
        const { error } = await supabaseAdmin
            .from("users")
            .select("id", { head: true, count: "exact" })
            .limit(1)
            .abortSignal(controller.signal)
        if (error) throw error
        supabaseStatus = { status: "ok", latency_ms: Date.now() - checkedAt }
    } catch (error) {
        supabaseStatus = {
            status: "error",
            latency_ms: Date.now() - checkedAt,
            error: error instanceof Error && error.name === "AbortError" ? "timeout" : "unreachable",
        }
    } finally {
        clearTimeout(timeout)
    }

    return {
        status: supabaseStatus.status === "ok" ? "ok" : "unavailable",
        service: "passage-api",
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        started_at: startedAt.toISOString(),
        checks: { api: { status: "ok" }, supabase: supabaseStatus },
    }
}

export const Health = async (_req: Request, res: Response) => {
    const snapshot = await getHealthSnapshot()
    res.set("Cache-Control", "no-store")
    return res.status(snapshot.status === "ok" ? 200 : 503).json(snapshot)
}

