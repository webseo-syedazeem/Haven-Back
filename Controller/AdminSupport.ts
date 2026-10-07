import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

export const supportTypes = ["contact_support", "request_soundscape", "report_audio_problem"] as const
export const supportStatuses = ["open", "in_review", "resolved", "closed"] as const
const fields = "id,user_id,type,subject,message,soundscape_id,contact_email,status,reason,created_at,updated_at,user:users(id,name,email),soundscape:soundscapes(id,title)"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error })

export function parseSupportFilters(query: Request["query"]) {
    const read = (key: string) => {
        const value = query[key]
        if (value === undefined) return ""
        if (typeof value !== "string") throw new Error(`Invalid ${key}`)
        return value.trim()
    }
    const integer = (key: string, fallback: number, max: number) => {
        const value = read(key)
        if (!value) return fallback
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) throw new Error(`Invalid ${key}`)
        return Number(value)
    }
    const type = read("type"), status = read("status"), q = read("q")
    if (type && !supportTypes.some(value => value === type)) throw new Error("Invalid type")
    if (status && !supportStatuses.some(value => value === status)) throw new Error("Invalid status")
    if (q.length > 200) throw new Error("Search must be 200 characters or fewer")
    const date = (key: string) => {
        const value = read(key)
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`Invalid ${key} date`)
        return value
    }
    const from = date("from"), to = date("to")
    if (from && to && from > to) throw new Error("Start date must not follow end date")
    return { page: integer("page", 1, 1_000_000), page_size: integer("page_size", 25, 100), type, status, q, from, to }
}

export const GetAdminSupport = async (req: Request, res: Response) => {
    let filters: ReturnType<typeof parseSupportFilters>
    try { filters = parseSupportFilters(req.query) } catch (error) { return fail(res, 400, error instanceof Error ? error.message : "Invalid filters") }
    try {
        const queryFor = (head = false) => {
            let query = supabaseAdmin.from("support_requests").select(head ? "id" : fields, { count: "exact", head })
            if (filters.type) query = query.eq("type", filters.type)
            if (filters.status) query = query.eq("status", filters.status)
            if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`)
            if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`)
            if (filters.q) {
                // Quoted PostgREST values prevent filter-expression injection; escape LIKE wildcards.
                const term = filters.q.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[%_*]/g, "\\$&")
                query = query.or(["subject", "message", "contact_email"].map(column => `${column}.ilike."%${term}%"`).join(","))
            }
            return query
        }
        const start = (filters.page - 1) * filters.page_size
        const [list, open, contact, requests, reports] = await Promise.all([
            queryFor().order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + filters.page_size - 1),
            queryFor(true).eq("status", "open"),
            ...supportTypes.map(type => queryFor(true).eq("type", type)),
        ])
        if ([list, open, contact, requests, reports].some(result => result.error)) return fail(res, 500, "Unable to load support requests")
        const total = list.count || 0
        return res.json({ success: true, data: {
            requests: list.data || [],
            pagination: { page: filters.page, page_size: filters.page_size, total, total_pages: Math.ceil(total / filters.page_size) },
            summary: { total, open: open.count || 0, contact_support: contact.count || 0, request_soundscape: requests.count || 0, report_audio_problem: reports.count || 0 },
        } })
    } catch { return fail(res, 500, "Unable to load support requests") }
}

export const GetOneAdminSupport = async (req: Request, res: Response) => {
    const id = req.params.id
    if (typeof id !== "string" || !uuid.test(id)) return fail(res, 400, "Invalid support request ID")
    try {
        const { data, error } = await supabaseAdmin.from("support_requests").select(fields).eq("id", id).maybeSingle()
        if (error) return fail(res, 500, "Unable to load support request")
        if (!data) return fail(res, 404, "Support request not found")
        return res.json({ success: true, data: { request: data } })
    } catch { return fail(res, 500, "Unable to load support request") }
}

export const UpdateAdminSupportStatus = async (req: Request, res: Response) => {
    const id = req.params.id, status: unknown = req.body?.status
    if (typeof id !== "string" || !uuid.test(id)) return fail(res, 400, "Invalid support request ID")
    if (!supportStatuses.some(value => value === status)) return fail(res, 400, "Invalid support status")
    try {
        const { data, error } = await supabaseAdmin.from("support_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select(fields).maybeSingle()
        if (error) return fail(res, 500, "Unable to update support status")
        if (!data) return fail(res, 404, "Support request not found")
        return res.json({ success: true, data: { request: data } })
    } catch { return fail(res, 500, "Unable to update support status") }
}
