import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

type AppUserId = string | number

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const getRequestBody = (req: Request): Record<string, unknown> => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return {}
    }

    return req.body as Record<string, unknown>
}

const getOptionalString = (
    body: Record<string, unknown>,
    field: string,
    res: Response,
): string | null | undefined => {
    if (!Object.prototype.hasOwnProperty.call(body, field) || body[field] === null) {
        return null
    }

    if (typeof body[field] !== "string") {
        res.status(400).json({ success: false, error: `${field} must be a string` })
        return undefined
    }

    return body[field].trim() || null
}

const getAppUserId = async (req: Request, res: Response): Promise<AppUserId | null | undefined> => {
    if (!req.user) {
        return null
    }

    const { data: userProfile, error: userProfileError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", req.user.id)
        .maybeSingle()

    if (userProfileError) {
        console.error("Find user profile for support request error:", userProfileError)
        res.status(500).json({ success: false, error: "Failed to find user profile" })
        return undefined
    }

    if (!userProfile) {
        res.status(401).json({ success: false, error: "User profile not found" })
        return undefined
    }

    return userProfile.id as AppUserId
}

const resolveSubmissionIdentity = async (
    req: Request,
    res: Response,
    contactEmail: string | null,
): Promise<{ userId: AppUserId | null } | null> => {
    if (!req.user && !contactEmail) {
        res.status(400).json({
            success: false,
            error: "contact_email is required for guest submissions",
        })
        return null
    }

    const userId = await getAppUserId(req, res)

    if (userId === undefined) {
        return null
    }

    return { userId }
}

export const ContactSupport = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const message = getOptionalString(body, "message", res)

    if (message === undefined) {
        return
    }

    if (!message) {
        return res.status(400).json({ success: false, error: "message is required" })
    }

    const subject = getOptionalString(body, "subject", res)

    if (subject === undefined) {
        return
    }

    const contactEmail = getOptionalString(body, "contact_email", res)

    if (contactEmail === undefined) {
        return
    }

    try {
        const identity = await resolveSubmissionIdentity(req, res, contactEmail)

        if (!identity) {
            return
        }

        const { data: supportRequest, error: supportRequestError } = await supabaseAdmin
            .from("support_requests")
            .insert({
                user_id: identity.userId,
                type: "contact_support",
                subject,
                message,
                soundscape_id: null,
                contact_email: contactEmail,
            })
            .select("*")
            .single()

        if (supportRequestError) {
            console.error("Create contact support request error:", supportRequestError)
            return res.status(500).json({ success: false, error: "Failed to submit support request" })
        }

        return res.status(201).json({ success: true, data: { request: supportRequest } })
    } catch (err) {
        console.error("Error creating contact support request:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ReportAudioProblem = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const soundscapeId = getOptionalString(body, "soundscape_id", res)

    if (soundscapeId === undefined) {
        return
    }

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    if (!UUID_PATTERN.test(soundscapeId)) {
        return res.status(400).json({ success: false, error: "soundscape_id must be a valid UUID" })
    }

    const suppliedMessage = getOptionalString(body, "message", res)

    if (suppliedMessage === undefined) {
        return
    }

    // Optional structured reason (e.g. "Audio cuts out"). Additive: `message`
    // is validated and stored exactly as before, so a client that still folds
    // the reason into the message text keeps working unchanged.
    const reason = getOptionalString(body, "reason", res)

    if (reason === undefined) {
        return
    }

    const contactEmail = getOptionalString(body, "contact_email", res)

    if (contactEmail === undefined) {
        return
    }

    try {
        const identity = await resolveSubmissionIdentity(req, res, contactEmail)

        if (!identity) {
            return
        }

        const { data: soundscape, error: soundscapeError } = await supabaseAdmin
            .from("soundscapes")
            .select("id, title")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (soundscapeError) {
            console.error("Report audio problem soundscape lookup error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to check soundscape" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found" })
        }

        const { data: supportRequest, error: supportRequestError } = await supabaseAdmin
            .from("support_requests")
            .insert({
                user_id: identity.userId,
                type: "report_audio_problem",
                subject: `Audio issue: ${soundscape.title || "Soundscape"}`,
                message: suppliedMessage || reason || "Audio problem reported",
                soundscape_id: soundscape.id,
                reason,
                contact_email: contactEmail,
            })
            .select("*")
            .single()

        if (supportRequestError) {
            console.error("Create audio problem report error:", supportRequestError)
            return res.status(500).json({ success: false, error: "Failed to submit audio problem report" })
        }

        return res.status(201).json({ success: true, data: { request: supportRequest } })
    } catch (err) {
        console.error("Error creating audio problem report:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RequestSoundscape = async (req: Request, res: Response) => {
    const body = getRequestBody(req)
    const message = getOptionalString(body, "message", res)

    if (message === undefined) {
        return
    }

    if (!message) {
        return res.status(400).json({ success: false, error: "message is required" })
    }

    const contactEmail = getOptionalString(body, "contact_email", res)

    if (contactEmail === undefined) {
        return
    }

    try {
        const identity = await resolveSubmissionIdentity(req, res, contactEmail)

        if (!identity) {
            return
        }

        const { data: supportRequest, error: supportRequestError } = await supabaseAdmin
            .from("support_requests")
            .insert({
                user_id: identity.userId,
                type: "request_soundscape",
                subject: null,
                message,
                soundscape_id: null,
                contact_email: contactEmail,
            })
            .select("*")
            .single()

        if (supportRequestError) {
            console.error("Create soundscape request error:", supportRequestError)
            return res.status(500).json({ success: false, error: "Failed to submit soundscape request" })
        }

        return res.status(201).json({ success: true, data: { request: supportRequest } })
    } catch (err) {
        console.error("Error creating soundscape request:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetMySupportRequests = async (req: Request, res: Response) => {
    try {
        const userId = await getAppUserId(req, res)

        if (userId === null || userId === undefined) {
            return
        }

        const { data: supportRequests, error: supportRequestsError } = await supabaseAdmin
            .from("support_requests")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })

        if (supportRequestsError) {
            console.error("Get user's support requests error:", supportRequestsError)
            return res.status(500).json({ success: false, error: "Failed to get support requests" })
        }

        return res.status(200).json({
            success: true,
            data: { requests: supportRequests || [] },
        })
    } catch (err) {
        console.error("Error getting user's support requests:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
