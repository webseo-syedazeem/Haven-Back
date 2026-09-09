import { invalidateSoundscapes, invalidateCollection } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const SOUNDSCAPE_MODES = ["sleep", "relax", "focus"] as const
const SOUNDSCAPE_STATUSES = [
    "draft",
    "master_review",
    "tags_verified",
    "release_approved",
    "live",
    "revised",
    "retired",
] as const
const DETAIL_LEVELS = ["minimal", "balanced", "rich"] as const

const SOUNDSCAPE_TEXT_FIELDS = [
    "subcategory",
    "title",
    "short_title",
    "one_line_description",
    "designed_for",
    "best_use",
    "artwork_url",
    "perspective",
    "movement",
    "file_url",
    "science_label",
    "science_note",
    "catalogue_ref",
    "qa_reviewer",
    "rights_status",
] as const

const SOUNDSCAPE_ARRAY_FIELDS = [
    "contains",
    "does_not_contain",
    "animals",
    "instruments",
    "sound_sources",
    "search_keywords",
] as const

const SOUNDSCAPE_BOOLEAN_FIELDS = ["human_presence", "is_loop"] as const
const SOUNDSCAPE_INTEGER_FIELDS = [
    "intensity",
    "duration_seconds",
    "file_size_bytes",
    "sort_score",
] as const

const SOUNDSCAPE_COPY_OMIT_FIELDS = new Set([
    "id",
    "created_at",
    "updated_at",
    "status",
    "version_of",
    "catalogue_ref",
])

// Section 10.3 prohibited claims for science_note (frequency heals / repairs DNA /
// forces a brain state / treats anxiety / guarantees sleep / guarantees productivity).
// This is a simple case-insensitive substring blocklist, not NLP — a basic safety net
// pending human editorial review, not a replacement for it. Non-developers can extend
// it by adding another lowercase phrase to this array; no other code changes needed.
export const PROHIBITED_SCIENCE_NOTE_PHRASES = [
    "heal",
    "repair dna",
    "repairs dna",
    "dna repair",
    "guarantee sleep",
    "guarantees sleep",
    "guarantee productivity",
    "guarantees productivity",
    "cure",
    "cures",
    "treats anxiety",
    "treat anxiety",
    "force a brain state",
    "forces a brain state",
    "brainwave entrainment guarantee",
] as const

const findProhibitedScienceNotePhrase = (value: string): string | null => {
    const normalized = value.toLowerCase()

    for (const phrase of PROHIBITED_SCIENCE_NOTE_PHRASES) {
        if (normalized.includes(phrase)) {
            return phrase
        }
    }

    return null
}

const COLLECTION_TEXT_FIELDS = [
    "slug",
    "title",
    "description",
    "cover_image_url",
] as const

const EXPLORE_GROUPS = [
    "nature",
    "indoor",
    "travel",
    "animals",
    "instruments",
    "weather",
    "situation",
    "editorial",
] as const

type SoundscapeMode = (typeof SOUNDSCAPE_MODES)[number]
type SoundscapeStatus = (typeof SOUNDSCAPE_STATUSES)[number]
type DetailLevel = (typeof DETAIL_LEVELS)[number]
type ExploreGroup = (typeof EXPLORE_GROUPS)[number]

type ValidationResult = {
    values: Record<string, unknown>
    error?: string
}

type CollectionMembership = {
    soundscape_id: unknown
    sort_order: unknown
}

type SoundscapeRecord = Record<string, unknown> & {
    id: string
}

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isSoundscapeMode = (value: unknown): value is SoundscapeMode => {
    return SOUNDSCAPE_MODES.includes(value as SoundscapeMode)
}

const isSoundscapeStatus = (value: unknown): value is SoundscapeStatus => {
    return SOUNDSCAPE_STATUSES.includes(value as SoundscapeStatus)
}

const isDetailLevel = (value: unknown): value is DetailLevel => {
    return DETAIL_LEVELS.includes(value as DetailLevel)
}

const isExploreGroup = (value: unknown): value is ExploreGroup => {
    return EXPLORE_GROUPS.includes(value as ExploreGroup)
}

const normalizeRequiredText = (value: unknown) => String(value ?? "").trim()

const validateNullableText = (field: string, value: unknown) => {
    if (value === null) {
        return { value: null }
    }

    if (typeof value !== "string") {
        return { value: null, error: `${field} must be a string or null` }
    }

    return { value: value.trim() }
}

const validateInteger = (
    field: string,
    value: unknown,
    options: { nullable?: boolean; min?: number; max?: number } = {}
) => {
    if (value === null && options.nullable) {
        return { value: null }
    }

    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        return { value: null, error: `${field} must be an integer${options.nullable ? " or null" : ""}` }
    }

    if (options.min !== undefined && value < options.min) {
        return { value: null, error: `${field} must be at least ${options.min}` }
    }

    if (options.max !== undefined && value > options.max) {
        return { value: null, error: `${field} must be at most ${options.max}` }
    }

    return { value }
}

const validateSoundscapeFields = (body: unknown): ValidationResult => {
    if (!isObject(body)) {
        return { values: {}, error: "Request body must be an object" }
    }

    const values: Record<string, unknown> = {}

    if (body.mode !== undefined) {
        if (!isSoundscapeMode(body.mode)) {
            return { values, error: "mode must be one of sleep, relax, or focus" }
        }
        values.mode = body.mode
    }

    for (const field of SOUNDSCAPE_TEXT_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const validated = validateNullableText(field, body[field])
        if (validated.error) {
            return { values, error: validated.error }
        }

        if (field === "science_note" && validated.value) {
            const prohibitedPhrase = findProhibitedScienceNotePhrase(validated.value)
            if (prohibitedPhrase) {
                return {
                    values,
                    error: `science_note contains a prohibited claim phrase: '${prohibitedPhrase}'. Rephrase using evidence-supported/research-informed/experimental/experiential framing per Section 10.3.`,
                }
            }
        }

        values[field] = validated.value
    }

    for (const field of SOUNDSCAPE_ARRAY_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const value = body[field]
        if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
            return { values, error: `${field} must be an array of strings` }
        }

        values[field] = value.map((item) => item.trim()).filter(Boolean)
    }

    for (const field of SOUNDSCAPE_BOOLEAN_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const value = body[field]
        if (typeof value !== "boolean") {
            return { values, error: `${field} must be a boolean` }
        }
        values[field] = value
    }

    for (const field of SOUNDSCAPE_INTEGER_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const range = field === "intensity"
            ? { nullable: true, min: 1, max: 5 }
            : { nullable: true, min: 0 }
        const validated = validateInteger(field, body[field], range)
        if (validated.error) {
            return { values, error: validated.error }
        }
        values[field] = validated.value
    }

    if (body.detail_level !== undefined) {
        if (body.detail_level !== null && !isDetailLevel(body.detail_level)) {
            return { values, error: "detail_level must be one of minimal, balanced, or rich" }
        }
        values.detail_level = body.detail_level
    }

    if (body.qa_passed_at !== undefined) {
        if (body.qa_passed_at === null) {
            values.qa_passed_at = null
        } else if (typeof body.qa_passed_at !== "string" || !body.qa_passed_at.trim()) {
            return { values, error: "qa_passed_at must be an ISO timestamp string or null" }
        } else {
            const parsed = new Date(body.qa_passed_at)
            if (Number.isNaN(parsed.getTime())) {
                return { values, error: "qa_passed_at must be a valid ISO timestamp" }
            }
            values.qa_passed_at = parsed.toISOString()
        }
    }

    if (body.release_date !== undefined) {
        if (body.release_date === null) {
            values.release_date = null
        } else if (typeof body.release_date !== "string" || !body.release_date.trim()) {
            return { values, error: "release_date must be a YYYY-MM-DD string or null" }
        } else {
            const releaseDate = body.release_date.trim()
            if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
                return { values, error: "release_date must be a YYYY-MM-DD string or null" }
            }
            values.release_date = releaseDate
        }
    }

    return { values }
}

const validateRequiredSoundscapeFields = (values: Record<string, unknown>) => {
    if (!isSoundscapeMode(values.mode)) {
        return "mode is required and must be one of sleep, relax, or focus"
    }

    if (!normalizeRequiredText(values.subcategory)) {
        return "subcategory is required"
    }

    if (!normalizeRequiredText(values.title)) {
        return "title is required"
    }

    return null
}

const validateCollectionFields = (body: unknown): ValidationResult => {
    if (!isObject(body)) {
        return { values: {}, error: "Request body must be an object" }
    }

    const values: Record<string, unknown> = {}

    for (const field of COLLECTION_TEXT_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const validated = validateNullableText(field, body[field])
        if (validated.error) {
            return { values, error: validated.error }
        }
        values[field] = validated.value
    }

    if (body.mode !== undefined) {
        if (body.mode !== null && !isSoundscapeMode(body.mode)) {
            return { values, error: "mode must be one of sleep, relax, focus, or null" }
        }
        values.mode = body.mode
    }

    if (body.explore_group !== undefined) {
        if (body.explore_group !== null && !isExploreGroup(body.explore_group)) {
            return { values, error: `explore_group must be one of ${EXPLORE_GROUPS.join(", ")}, or null` }
        }
        values.explore_group = body.explore_group
    }

    if (body.sort_order !== undefined) {
        const validated = validateInteger("sort_order", body.sort_order, {
            nullable: true,
            min: 0,
        })
        if (validated.error) {
            return { values, error: validated.error }
        }
        values.sort_order = validated.value
    }

    return { values }
}

const getCollection = async (collectionId: string) => {
    const { data, error } = await supabaseAdmin
        .from("collections")
        .select("*")
        .eq("id", collectionId)
        .maybeSingle()

    if (error) {
        throw error
    }

    return data
}

const touchCollection = async (collectionId: string) => {
    const { error } = await supabaseAdmin
        .from("collections")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", collectionId)

    if (error) {
        throw error
    }
}

export const CreateAdminSoundscape = async (req: Request, res: Response) => {
    const validated = validateSoundscapeFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    const requiredError = validateRequiredSoundscapeFields(validated.values)
    if (requiredError) {
        return res.status(400).json({ success: false, error: requiredError })
    }

    for (const field of SOUNDSCAPE_ARRAY_FIELDS) {
        if (validated.values[field] === undefined) {
            validated.values[field] = []
        }
    }

    try {
        const { data: soundscape, error } = await supabaseAdmin
            .from("soundscapes")
            .insert({ ...validated.values, status: "draft" })
            .select("*")
            .single()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "A soundscape with that unique value already exists",
                })
            }

            console.error("Create admin soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to create soundscape" })
        }

        await invalidateSoundscapes()

        return res.status(201).json({ success: true, data: { soundscape } })
    } catch (err) {
        console.error("Error creating admin soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAdminSoundscapes = async (req: Request, res: Response) => {
    const rawStatus = req.query.status
    const status = rawStatus === undefined
        ? null
        : typeof rawStatus === "string"
            ? rawStatus.trim()
            : ""

    if (status !== null && !isSoundscapeStatus(status)) {
        return res.status(400).json({
            success: false,
            error: `status must be one of ${SOUNDSCAPE_STATUSES.join(", ")}`,
        })
    }

    try {
        let query = supabaseAdmin
            .from("soundscapes")
            .select("*")
            .order("updated_at", { ascending: false })

        if (status !== null) {
            query = query.eq("status", status)
        }

        const { data: soundscapes, error } = await query

        if (error) {
            console.error("Get admin soundscapes error:", error)
            return res.status(500).json({ success: false, error: "Failed to get soundscapes" })
        }

        return res.status(200).json({
            success: true,
            data: { soundscapes: soundscapes || [] },
        })
    } catch (err) {
        console.error("Error getting admin soundscapes:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneAdminSoundscape = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const { data: soundscape, error } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (error) {
            console.error("Get admin soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to get soundscape" })
        }

        if (!soundscape) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        return res.status(200).json({ success: true, data: { soundscape } })
    } catch (err) {
        console.error("Error getting admin soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateAdminSoundscape = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()
    const statusWasSupplied = isObject(req.body) && req.body.status !== undefined
    const validated = validateSoundscapeFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    if (validated.values.mode !== undefined && !isSoundscapeMode(validated.values.mode)) {
        return res.status(400).json({ success: false, error: "Invalid mode" })
    }

    for (const requiredField of ["subcategory", "title"] as const) {
        if (
            Object.prototype.hasOwnProperty.call(validated.values, requiredField)
            && !normalizeRequiredText(validated.values[requiredField])
        ) {
            return res.status(400).json({
                success: false,
                error: `${requiredField} cannot be empty`,
            })
        }
    }

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (existingError) {
            console.error("Check admin soundscape error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to update soundscape" })
        }

        if (!existing) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        let soundscape = existing

        if (Object.keys(validated.values).length > 0) {
            const { data, error } = await supabaseAdmin
                .from("soundscapes")
                .update({ ...validated.values, updated_at: new Date().toISOString() })
                .eq("id", soundscapeId)
                .select("*")
                .single()

            if (error) {
                if (error.code === "23505") {
                    return res.status(400).json({
                        success: false,
                        error: "A soundscape with that unique value already exists",
                    })
                }

                console.error("Update admin soundscape error:", error)
                return res.status(500).json({ success: false, error: "Failed to update soundscape" })
            }

            await invalidateSoundscapes()
            soundscape = data
        } else if (!statusWasSupplied) {
            return res.status(400).json({
                success: false,
                error: "At least one editable soundscape field is required",
            })
        }

        const responseData: Record<string, unknown> = { soundscape }
        if (statusWasSupplied) {
            responseData.note = "Status was not changed. Use the dedicated status endpoint."
        }

        return res.status(200).json({ success: true, data: responseData })
    } catch (err) {
        console.error("Error updating admin soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateAdminSoundscapeStatus = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()
    const status = req.body?.status

    if (!isSoundscapeStatus(status)) {
        return res.status(400).json({
            success: false,
            error: `status must be one of ${SOUNDSCAPE_STATUSES.join(", ")}`,
        })
    }

    try {
        const { data: soundscape, error } = await supabaseAdmin
            .from("soundscapes")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", soundscapeId)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("Update admin soundscape status error:", error)
            return res.status(500).json({ success: false, error: "Failed to update soundscape status" })
        }

        if (!soundscape) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        await invalidateSoundscapes()

        return res.status(200).json({ success: true, data: { soundscape } })
    } catch (err) {
        console.error("Error updating admin soundscape status:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteAdminSoundscape = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("soundscapes")
            .select("id, status")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (existingError) {
            console.error("Check admin soundscape for deletion error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to delete soundscape" })
        }

        if (!existing) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        if (existing.status !== "draft") {
            return res.status(400).json({
                success: false,
                error: "Only draft soundscapes can be deleted. Set this soundscape to retired instead.",
            })
        }

        const { data: deleted, error } = await supabaseAdmin
            .from("soundscapes")
            .delete()
            .eq("id", soundscapeId)
            .eq("status", "draft")
            .select("id")
            .maybeSingle()

        if (error) {
            if (error.code === "23503") {
                return res.status(400).json({
                    success: false,
                    error: "Draft soundscape is still referenced; remove it from collections first",
                })
            }

            console.error("Delete admin soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to delete soundscape" })
        }

        if (!deleted) {
            return res.status(400).json({
                success: false,
                error: "Soundscape status changed; only drafts can be deleted",
            })
        }

        await invalidateSoundscapes()

        return res.status(200).json({
            success: true,
            data: { message: "Soundscape deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting admin soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const ReviseAdminSoundscape = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (existingError) {
            console.error("Check soundscape for revise error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to revise soundscape" })
        }

        if (!existing) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        const revisionPayload: Record<string, unknown> = {}
        for (const [field, value] of Object.entries(existing as Record<string, unknown>)) {
            if (SOUNDSCAPE_COPY_OMIT_FIELDS.has(field)) {
                continue
            }
            revisionPayload[field] = value
        }

        revisionPayload.status = "draft"
        revisionPayload.version_of = soundscapeId
        revisionPayload.catalogue_ref = null

        const { data: revision, error } = await supabaseAdmin
            .from("soundscapes")
            .insert(revisionPayload)
            .select("*")
            .single()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "Could not create revision due to a unique constraint conflict",
                })
            }

            console.error("Revise admin soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to revise soundscape" })
        }

        await invalidateSoundscapes()

        return res.status(201).json({
            success: true,
            data: {
                soundscape: revision,
                original: existing,
                note: "Revision created as draft. The original soundscape status was not changed — update it separately (for example to revised) via the status endpoint when ready.",
            },
        })
    } catch (err) {
        console.error("Error revising admin soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

const TAG_EVENT_GROUPS = [
    "contains",
    "does_not_contain",
    "animals",
    "instruments",
    "sound_sources",
    "search_keywords",
] as const

const TAG_EVENT_STATES = ["intended", "generated", "detected", "verified"] as const

type TagEventGroup = (typeof TAG_EVENT_GROUPS)[number]
type TagEventState = (typeof TAG_EVENT_STATES)[number]

const isTagEventGroup = (value: unknown): value is TagEventGroup => {
    return TAG_EVENT_GROUPS.includes(value as TagEventGroup)
}

const isTagEventState = (value: unknown): value is TagEventState => {
    return TAG_EVENT_STATES.includes(value as TagEventState)
}

export const GetAdminSoundscapeTagEvents = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("soundscapes")
            .select("id")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (existingError) {
            console.error("Check soundscape for tag events error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to get tag events" })
        }

        if (!existing) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        const { data: tagEvents, error } = await supabaseAdmin
            .from("soundscape_tag_events")
            .select("*")
            .eq("soundscape_id", soundscapeId)
            .order("created_at", { ascending: false })

        if (error) {
            console.error("Get admin soundscape tag events error:", error)
            return res.status(500).json({ success: false, error: "Failed to get tag events" })
        }

        return res.status(200).json({
            success: true,
            data: { tag_events: tagEvents || [] },
        })
    } catch (err) {
        console.error("Error getting admin soundscape tag events:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const CreateAdminSoundscapeTagEvent = async (req: Request, res: Response) => {
    const soundscapeId = String(req.params.id || "").trim()
    const tagGroup = req.body?.tag_group
    const tagValue = typeof req.body?.tag_value === "string"
        ? req.body.tag_value.trim()
        : ""
    const state = req.body?.state
    const sourceProvided = isObject(req.body) && Object.prototype.hasOwnProperty.call(req.body, "source")

    if (!isTagEventGroup(tagGroup)) {
        return res.status(400).json({
            success: false,
            error: `tag_group must be one of ${TAG_EVENT_GROUPS.join(", ")}`,
        })
    }

    if (!tagValue) {
        return res.status(400).json({ success: false, error: "tag_value is required" })
    }

    if (!isTagEventState(state)) {
        return res.status(400).json({
            success: false,
            error: `state must be one of ${TAG_EVENT_STATES.join(", ")}`,
        })
    }

    if (sourceProvided && req.body.source !== null && typeof req.body.source !== "string") {
        return res.status(400).json({ success: false, error: "source must be a string or null" })
    }

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("soundscapes")
            .select("id")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (existingError) {
            console.error("Check soundscape for tag event create error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to create tag event" })
        }

        if (!existing) {
            return res.status(404).json({ success: false, error: "Soundscape not found" })
        }

        const payload: Record<string, unknown> = {
            soundscape_id: soundscapeId,
            tag_group: tagGroup,
            tag_value: tagValue,
            state,
        }

        if (sourceProvided) {
            payload.source = typeof req.body.source === "string"
                ? req.body.source.trim() || null
                : null
        }

        const { data: tagEvent, error } = await supabaseAdmin
            .from("soundscape_tag_events")
            .insert(payload)
            .select("*")
            .single()

        if (error) {
            console.error("Create admin soundscape tag event error:", error)
            return res.status(500).json({ success: false, error: "Failed to create tag event" })
        }

        return res.status(201).json({ success: true, data: { tag_event: tagEvent } })
    } catch (err) {
        console.error("Error creating admin soundscape tag event:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const CreateAdminCollection = async (req: Request, res: Response) => {
    const validated = validateCollectionFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    if (!normalizeRequiredText(validated.values.slug)) {
        return res.status(400).json({ success: false, error: "slug is required" })
    }

    if (!normalizeRequiredText(validated.values.title)) {
        return res.status(400).json({ success: false, error: "title is required" })
    }

    try {
        const { data: collection, error } = await supabaseAdmin
            .from("collections")
            .insert({ ...validated.values, is_published: false })
            .select("*")
            .single()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "A collection with this slug already exists",
                })
            }

            console.error("Create admin collection error:", error)
            return res.status(500).json({ success: false, error: "Failed to create collection" })
        }

        await invalidateCollection(String(collection.id))

        return res.status(201).json({ success: true, data: { collection } })
    } catch (err) {
        console.error("Error creating admin collection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAdminCollections = async (_req: Request, res: Response) => {
    try {
        const { data: collections, error } = await supabaseAdmin
            .from("collections")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("title", { ascending: true })

        if (error) {
            console.error("Get admin collections error:", error)
            return res.status(500).json({ success: false, error: "Failed to get collections" })
        }

        const rows = collections || []
        const itemCounts = new Map<string, number>()

        if (rows.length > 0) {
            const ids = rows.map((collection) => String(collection.id))
            const { data: memberships, error: membershipsError } = await supabaseAdmin
                .from("collection_soundscapes")
                .select("collection_id")
                .in("collection_id", ids)

            if (membershipsError) {
                console.error("Get admin collection counts error:", membershipsError)
                return res.status(500).json({ success: false, error: "Failed to get collections" })
            }

            for (const membership of memberships || []) {
                const collectionId = String(membership.collection_id)
                itemCounts.set(collectionId, (itemCounts.get(collectionId) || 0) + 1)
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                collections: rows.map((collection) => ({
                    ...collection,
                    item_count: itemCounts.get(String(collection.id)) || 0,
                })),
            },
        })
    } catch (err) {
        console.error("Error getting admin collections:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneAdminCollection = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()

    try {
        const collection = await getCollection(collectionId)

        if (!collection) {
            return res.status(404).json({ success: false, error: "Collection not found" })
        }

        const { data: membershipRows, error: membershipError } = await supabaseAdmin
            .from("collection_soundscapes")
            .select("soundscape_id, sort_order")
            .eq("collection_id", collectionId)
            .order("sort_order", { ascending: true })

        if (membershipError) {
            console.error("Get admin collection memberships error:", membershipError)
            return res.status(500).json({ success: false, error: "Failed to get collection" })
        }

        const memberships = (membershipRows || []) as CollectionMembership[]
        const soundscapeIds = memberships.map((row) => String(row.soundscape_id))
        let orderedSoundscapes: Array<SoundscapeRecord & { collection_sort_order: number }> = []

        if (soundscapeIds.length > 0) {
            const { data: soundscapes, error: soundscapesError } = await supabaseAdmin
                .from("soundscapes")
                .select("*")
                .in("id", soundscapeIds)

            if (soundscapesError) {
                console.error("Get admin collection soundscapes error:", soundscapesError)
                return res.status(500).json({ success: false, error: "Failed to get collection" })
            }

            const byId = new Map(
                ((soundscapes || []) as SoundscapeRecord[]).map((soundscape) => [
                    String(soundscape.id),
                    soundscape,
                ])
            )

            orderedSoundscapes = memberships
                .map((membership) => {
                    const soundscape = byId.get(String(membership.soundscape_id))
                    if (!soundscape) {
                        return null
                    }
                    return {
                        ...soundscape,
                        collection_sort_order: Number(membership.sort_order),
                    }
                })
                .filter((row): row is SoundscapeRecord & { collection_sort_order: number } => row !== null)
        }

        return res.status(200).json({
            success: true,
            data: {
                collection: {
                    ...collection,
                    item_count: orderedSoundscapes.length,
                    soundscapes: orderedSoundscapes,
                },
            },
        })
    } catch (err) {
        console.error("Error getting admin collection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateAdminCollection = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()
    const validated = validateCollectionFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    for (const requiredField of ["slug", "title"] as const) {
        if (
            Object.prototype.hasOwnProperty.call(validated.values, requiredField)
            && !normalizeRequiredText(validated.values[requiredField])
        ) {
            return res.status(400).json({
                success: false,
                error: `${requiredField} cannot be empty`,
            })
        }
    }

    if (Object.keys(validated.values).length === 0) {
        return res.status(400).json({
            success: false,
            error: "At least one editable collection field is required",
        })
    }

    try {
        const { data: collection, error } = await supabaseAdmin
            .from("collections")
            .update({ ...validated.values, updated_at: new Date().toISOString() })
            .eq("id", collectionId)
            .select("*")
            .maybeSingle()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "A collection with this slug already exists",
                })
            }

            console.error("Update admin collection error:", error)
            return res.status(500).json({ success: false, error: "Failed to update collection" })
        }

        if (!collection) {
            return res.status(404).json({ success: false, error: "Collection not found" })
        }

        await invalidateCollection(String(collection.id))

        return res.status(200).json({ success: true, data: { collection } })
    } catch (err) {
        console.error("Error updating admin collection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const PublishAdminCollection = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()
    const isPublished = req.body?.is_published

    if (typeof isPublished !== "boolean") {
        return res.status(400).json({
            success: false,
            error: "is_published must be a boolean",
        })
    }

    try {
        const { data: collection, error } = await supabaseAdmin
            .from("collections")
            .update({
                is_published: isPublished,
                updated_at: new Date().toISOString(),
            })
            .eq("id", collectionId)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("Publish admin collection error:", error)
            return res.status(500).json({ success: false, error: "Failed to update collection publication" })
        }

        if (!collection) {
            return res.status(404).json({ success: false, error: "Collection not found" })
        }

        await invalidateCollection(String(collection.id))

        return res.status(200).json({ success: true, data: { collection } })
    } catch (err) {
        console.error("Error publishing admin collection:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const AddAdminCollectionSoundscape = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()
    const soundscapeId = String(req.body?.soundscape_id || "").trim()

    if (!soundscapeId) {
        return res.status(400).json({ success: false, error: "soundscape_id is required" })
    }

    let requestedSortOrder: number | null = null
    if (req.body?.sort_order !== undefined) {
        const validated = validateInteger("sort_order", req.body.sort_order, { min: 0 })
        if (validated.error) {
            return res.status(400).json({ success: false, error: validated.error })
        }
        requestedSortOrder = validated.value as number
    }

    try {
        const collection = await getCollection(collectionId)
        if (!collection) {
            return res.status(404).json({ success: false, error: "Collection not found" })
        }

        const { data: soundscape, error: soundscapeError } = await supabaseAdmin
            .from("soundscapes")
            .select("*")
            .eq("id", soundscapeId)
            .maybeSingle()

        if (soundscapeError) {
            console.error("Check collection soundscape error:", soundscapeError)
            return res.status(500).json({ success: false, error: "Failed to add soundscape to collection" })
        }

        if (!soundscape) {
            return res.status(400).json({ success: false, error: "Soundscape not found" })
        }

        let sortOrder = requestedSortOrder
        if (sortOrder === null) {
            const { data: lastMembership, error: lastMembershipError } = await supabaseAdmin
                .from("collection_soundscapes")
                .select("sort_order")
                .eq("collection_id", collectionId)
                .order("sort_order", { ascending: false })
                .limit(1)
                .maybeSingle()

            if (lastMembershipError) {
                console.error("Get collection sort order error:", lastMembershipError)
                return res.status(500).json({ success: false, error: "Failed to add soundscape to collection" })
            }

            sortOrder = lastMembership ? Number(lastMembership.sort_order) + 1 : 0
        }

        const { data: membership, error } = await supabaseAdmin
            .from("collection_soundscapes")
            .insert({
                collection_id: collectionId,
                soundscape_id: soundscapeId,
                sort_order: sortOrder,
            })
            .select("*")
            .single()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({
                    success: false,
                    error: "Soundscape is already in this collection",
                })
            }

            console.error("Add admin collection soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to add soundscape to collection" })
        }

        try {
            await touchCollection(collectionId)
        } finally {
            // Membership already committed, even if the timestamp update fails.
            await invalidateCollection(collectionId)
        }

        return res.status(201).json({
            success: true,
            data: { membership, soundscape },
        })
    } catch (err) {
        console.error("Error adding admin collection soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const RemoveAdminCollectionSoundscape = async (req: Request, res: Response) => {
    const collectionId = String(req.params.id || "").trim()
    const soundscapeId = String(req.params.soundscapeId || "").trim()

    try {
        const collection = await getCollection(collectionId)
        if (!collection) {
            return res.status(404).json({ success: false, error: "Collection not found" })
        }

        const { data: deleted, error } = await supabaseAdmin
            .from("collection_soundscapes")
            .delete()
            .eq("collection_id", collectionId)
            .eq("soundscape_id", soundscapeId)
            .select("soundscape_id")
            .maybeSingle()

        if (error) {
            console.error("Remove admin collection soundscape error:", error)
            return res.status(500).json({ success: false, error: "Failed to remove soundscape from collection" })
        }

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: "Collection soundscape not found",
            })
        }

        try {
            await touchCollection(collectionId)
        } finally {
            // Membership already committed, even if the timestamp update fails.
            await invalidateCollection(collectionId)
        }

        return res.status(200).json({
            success: true,
            data: { message: "Soundscape removed from collection successfully" },
        })
    } catch (err) {
        console.error("Error removing admin collection soundscape:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

const isJsonValue = (value: unknown) => {
    if (value === undefined) {
        return false
    }
    try {
        JSON.stringify(value)
        return true
    } catch {
        return false
    }
}

export const GetAdminRemoteConfig = async (_req: Request, res: Response) => {
    try {
        const { data: entries, error } = await supabaseAdmin
            .from("remote_config")
            .select("*")
            .order("key", { ascending: true })

        if (error) {
            console.error("Get admin remote config error:", error)
            return res.status(500).json({ success: false, error: "Failed to get remote config" })
        }

        return res.status(200).json({
            success: true,
            data: { entries: entries || [] },
        })
    } catch (err) {
        console.error("Error getting admin remote config:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneAdminRemoteConfig = async (req: Request, res: Response) => {
    const key = String(req.params.key || "").trim()

    if (!key) {
        return res.status(400).json({ success: false, error: "key is required" })
    }

    try {
        const { data: entry, error } = await supabaseAdmin
            .from("remote_config")
            .select("*")
            .eq("key", key)
            .maybeSingle()

        if (error) {
            console.error("Get admin remote config entry error:", error)
            return res.status(500).json({ success: false, error: "Failed to get remote config entry" })
        }

        if (!entry) {
            return res.status(404).json({ success: false, error: "Remote config key not found" })
        }

        return res.status(200).json({ success: true, data: { entry } })
    } catch (err) {
        console.error("Error getting admin remote config entry:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpsertAdminRemoteConfig = async (req: Request, res: Response) => {
    const key = String(req.params.key || "").trim()

    if (!key) {
        return res.status(400).json({ success: false, error: "key is required" })
    }

    if (!isObject(req.body)) {
        return res.status(400).json({ success: false, error: "Request body must be an object" })
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, "value")) {
        return res.status(400).json({ success: false, error: "value is required" })
    }

    if (!isJsonValue(req.body.value)) {
        return res.status(400).json({ success: false, error: "value must be JSON-serializable" })
    }

    if (
        Object.prototype.hasOwnProperty.call(req.body, "is_verified")
        && typeof req.body.is_verified !== "boolean"
    ) {
        return res.status(400).json({ success: false, error: "is_verified must be a boolean when provided" })
    }

    try {
        const { data: existing, error: existingError } = await supabaseAdmin
            .from("remote_config")
            .select("*")
            .eq("key", key)
            .maybeSingle()

        if (existingError) {
            console.error("Check admin remote config error:", existingError)
            return res.status(500).json({ success: false, error: "Failed to upsert remote config" })
        }

        if (existing) {
            const updatePayload: Record<string, unknown> = {
                value: req.body.value,
                updated_at: new Date().toISOString(),
            }

            if (Object.prototype.hasOwnProperty.call(req.body, "is_verified")) {
                updatePayload.is_verified = req.body.is_verified
            }

            const { data: entry, error } = await supabaseAdmin
                .from("remote_config")
                .update(updatePayload)
                .eq("key", key)
                .select("*")
                .single()

            if (error) {
                console.error("Update admin remote config error:", error)
                return res.status(500).json({ success: false, error: "Failed to upsert remote config" })
            }

            return res.status(200).json({ success: true, data: { entry } })
        }

        const insertPayload = {
            key,
            value: req.body.value,
            is_verified: Object.prototype.hasOwnProperty.call(req.body, "is_verified")
                ? req.body.is_verified
                : false,
            updated_at: new Date().toISOString(),
        }

        const { data: entry, error } = await supabaseAdmin
            .from("remote_config")
            .upsert(insertPayload, { onConflict: "key" })
            .select("*")
            .single()

        if (error) {
            console.error("Insert admin remote config error:", error)
            return res.status(500).json({ success: false, error: "Failed to upsert remote config" })
        }

        return res.status(201).json({ success: true, data: { entry } })
    } catch (err) {
        console.error("Error upserting admin remote config:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteAdminRemoteConfig = async (req: Request, res: Response) => {
    const key = String(req.params.key || "").trim()

    if (!key) {
        return res.status(400).json({ success: false, error: "key is required" })
    }

    try {
        const { data: deleted, error } = await supabaseAdmin
            .from("remote_config")
            .delete()
            .eq("key", key)
            .select("key")
            .maybeSingle()

        if (error) {
            console.error("Delete admin remote config error:", error)
            return res.status(500).json({ success: false, error: "Failed to delete remote config" })
        }

        if (!deleted) {
            return res.status(404).json({ success: false, error: "Remote config key not found" })
        }

        return res.status(200).json({
            success: true,
            data: { message: "Remote config entry deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting admin remote config:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetPublicRemoteConfig = async (req: Request, res: Response) => {
    const key = String(req.params.key || "").trim()

    if (!key) {
        return res.status(400).json({ success: false, error: "key is required" })
    }

    try {
        const { data: entry, error } = await supabaseAdmin
            .from("remote_config")
            .select("key, value, is_verified")
            .eq("key", key)
            .eq("is_verified", true)
            .maybeSingle()

        if (error) {
            console.error("Get public remote config error:", error)
            return res.status(500).json({ success: false, error: "Failed to get remote config" })
        }

        if (!entry) {
            return res.status(404).json({ success: false, error: "Remote config key not found" })
        }

        return res.status(200).json({
            success: true,
            data: {
                key: entry.key,
                value: entry.value,
            },
        })
    } catch (err) {
        console.error("Error getting public remote config:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
