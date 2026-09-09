import { remember, CacheTTL, CacheReadError, invalidateHelp } from "../Utils/CacheHelper.ts"
import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"

const HELP_ARTICLE_TEXT_FIELDS = ["slug", "category", "title", "body"] as const

type ValidationResult = {
    values: Record<string, unknown>
    error?: string
}

type HelpArticleRow = Record<string, unknown> & {
    id: string
    category: unknown
    slug: unknown
    title: unknown
    sort_order: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
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

const validateInteger = (field: string, value: unknown, options: { min?: number } = {}) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        return { value: null, error: `${field} must be an integer` }
    }

    if (options.min !== undefined && value < options.min) {
        return { value: null, error: `${field} must be at least ${options.min}` }
    }

    return { value }
}

const validateHelpArticleFields = (body: unknown): ValidationResult => {
    if (!isObject(body)) {
        return { values: {}, error: "Request body must be an object" }
    }

    const values: Record<string, unknown> = {}

    for (const field of HELP_ARTICLE_TEXT_FIELDS) {
        if (body[field] === undefined) {
            continue
        }

        const validated = validateNullableText(field, body[field])
        if (validated.error) {
            return { values, error: validated.error }
        }
        values[field] = validated.value
    }

    if (body.sort_order !== undefined) {
        const validated = validateInteger("sort_order", body.sort_order, { min: 0 })
        if (validated.error) {
            return { values, error: validated.error }
        }
        values.sort_order = validated.value
    }

    return { values }
}

const groupByCategory = (articles: HelpArticleRow[]) => {
    const order: string[] = []
    const grouped = new Map<string, Array<{ slug: unknown; title: unknown; sort_order: unknown }>>()

    for (const article of articles) {
        const category = typeof article.category === "string" ? article.category : "uncategorized"

        if (!grouped.has(category)) {
            grouped.set(category, [])
            order.push(category)
        }

        grouped.get(category)!.push({
            slug: article.slug,
            title: article.title,
            sort_order: article.sort_order,
        })
    }

    return order.map((category) => ({ category, articles: grouped.get(category)! }))
}

// --- Public routes ---

/**
 * Reads the optional search term from `?q=` (or `?search=` as an alias).
 *
 * The term is stripped of the characters that would otherwise break PostgREST's
 * `or=(...)` grammar or act as LIKE wildcards — `% _ " \ , ( )` — rather than
 * escaped, because a help search never legitimately contains them and dropping
 * them cannot change the meaning of a real query. Returns "" when no usable
 * term was supplied, which means "no filter".
 */
const getHelpSearchTerm = (req: Request): string => {
    const raw = req.query.q ?? req.query.search

    if (typeof raw !== "string") {
        return ""
    }

    return raw.replace(/[%_"\\,()]/g, " ").trim()
}

export const GetHelpArticles = async (req: Request, res: Response) => {
    const searchTerm = getHelpSearchTerm(req)

    try {
        const data = await remember(searchTerm ? null : "help:all", CacheTTL.CONTENT, async () => {
            let query = supabaseAdmin
                .from("help_articles")
                .select("slug, category, title, sort_order")
                .eq("is_published", true)

            // Absent or unusable term leaves the query exactly as it was before, so
            // the endpoint's default behaviour is unchanged.
            if (searchTerm) {
                const pattern = `%${searchTerm}%`
                query = query.or(
                    `title.ilike."${pattern}",category.ilike."${pattern}",body.ilike."${pattern}"`
                )
            }

            const { data: articles, error } = await query
                .order("category", { ascending: true })
                .order("sort_order", { ascending: true })

            if (error) {
                console.error("Get help articles error:", error)
                throw new CacheReadError(500, "Failed to get help articles")
            }

            return { categories: groupByCategory((articles || []) as HelpArticleRow[]) }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting help articles:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetHelpArticle = async (req: Request, res: Response) => {
    const slug = String(req.params.slug || "").trim()

    try {
        // Reserve help:all for the list; an article can also have the slug "all".
        const key = slug === "all" ? "help:article:all" : `help:${encodeURIComponent(slug)}`
        const data = await remember(key, CacheTTL.CONTENT, async () => {
            const { data: article, error } = await supabaseAdmin
                .from("help_articles")
                .select("*")
                .eq("slug", slug)
                .eq("is_published", true)
                .maybeSingle()

            if (error) {
                console.error("Get help article error:", error)
                throw new CacheReadError(500, "Failed to get help article")
            }

            if (!article) {
                throw new CacheReadError(404, "Help article not found")
            }

            return { article }
        })

        return res.status(200).json({ success: true, data })
    } catch (err) {
        if (err instanceof CacheReadError) {
            return res.status(err.statusCode).json({ success: false, error: err.message })
        }

        console.error("Error getting help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

// --- Admin routes ---

export const CreateAdminHelpArticle = async (req: Request, res: Response) => {
    const validated = validateHelpArticleFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    for (const field of HELP_ARTICLE_TEXT_FIELDS) {
        if (!normalizeRequiredText(validated.values[field])) {
            return res.status(400).json({ success: false, error: `${field} is required` })
        }
    }

    try {
        const { data: article, error } = await supabaseAdmin
            .from("help_articles")
            .insert({
                ...validated.values,
                sort_order: validated.values.sort_order ?? 0,
                is_published: false,
            })
            .select("*")
            .single()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({ success: false, error: "A help article with this slug already exists" })
            }

            console.error("Create admin help article error:", error)
            return res.status(500).json({ success: false, error: "Failed to create help article" })
        }

        await invalidateHelp()

        return res.status(201).json({ success: true, data: { article } })
    } catch (err) {
        console.error("Error creating admin help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetAdminHelpArticles = async (_req: Request, res: Response) => {
    try {
        const { data: articles, error } = await supabaseAdmin
            .from("help_articles")
            .select("*")
            .order("category", { ascending: true })
            .order("sort_order", { ascending: true })

        if (error) {
            console.error("Get admin help articles error:", error)
            return res.status(500).json({ success: false, error: "Failed to get help articles" })
        }

        return res.status(200).json({ success: true, data: { articles: articles || [] } })
    } catch (err) {
        console.error("Error getting admin help articles:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const GetOneAdminHelpArticle = async (req: Request, res: Response) => {
    const articleId = String(req.params.id || "").trim()

    try {
        const { data: article, error } = await supabaseAdmin
            .from("help_articles")
            .select("*")
            .eq("id", articleId)
            .maybeSingle()

        if (error) {
            console.error("Get admin help article error:", error)
            return res.status(500).json({ success: false, error: "Failed to get help article" })
        }

        if (!article) {
            return res.status(404).json({ success: false, error: "Help article not found" })
        }

        return res.status(200).json({ success: true, data: { article } })
    } catch (err) {
        console.error("Error getting admin help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const UpdateAdminHelpArticle = async (req: Request, res: Response) => {
    const articleId = String(req.params.id || "").trim()
    const validated = validateHelpArticleFields(req.body)

    if (validated.error) {
        return res.status(400).json({ success: false, error: validated.error })
    }

    for (const field of HELP_ARTICLE_TEXT_FIELDS) {
        if (
            Object.prototype.hasOwnProperty.call(validated.values, field)
            && !normalizeRequiredText(validated.values[field])
        ) {
            return res.status(400).json({ success: false, error: `${field} cannot be empty` })
        }
    }

    if (Object.keys(validated.values).length === 0) {
        return res.status(400).json({ success: false, error: "At least one editable help article field is required" })
    }

    try {
        const { data: article, error } = await supabaseAdmin
            .from("help_articles")
            .update({ ...validated.values, updated_at: new Date().toISOString() })
            .eq("id", articleId)
            .select("*")
            .maybeSingle()

        if (error) {
            if (error.code === "23505") {
                return res.status(400).json({ success: false, error: "A help article with this slug already exists" })
            }

            console.error("Update admin help article error:", error)
            return res.status(500).json({ success: false, error: "Failed to update help article" })
        }

        if (!article) {
            return res.status(404).json({ success: false, error: "Help article not found" })
        }

        await invalidateHelp()

        return res.status(200).json({ success: true, data: { article } })
    } catch (err) {
        console.error("Error updating admin help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const PublishAdminHelpArticle = async (req: Request, res: Response) => {
    const articleId = String(req.params.id || "").trim()
    const isPublished = req.body?.is_published

    if (typeof isPublished !== "boolean") {
        return res.status(400).json({ success: false, error: "is_published must be a boolean" })
    }

    try {
        const { data: article, error } = await supabaseAdmin
            .from("help_articles")
            .update({ is_published: isPublished, updated_at: new Date().toISOString() })
            .eq("id", articleId)
            .select("*")
            .maybeSingle()

        if (error) {
            console.error("Publish admin help article error:", error)
            return res.status(500).json({ success: false, error: "Failed to update help article publication" })
        }

        if (!article) {
            return res.status(404).json({ success: false, error: "Help article not found" })
        }

        await invalidateHelp()

        return res.status(200).json({ success: true, data: { article } })
    } catch (err) {
        console.error("Error publishing admin help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const DeleteAdminHelpArticle = async (req: Request, res: Response) => {
    const articleId = String(req.params.id || "").trim()

    try {
        const { data: deleted, error } = await supabaseAdmin
            .from("help_articles")
            .delete()
            .eq("id", articleId)
            .select("id")
            .maybeSingle()

        if (error) {
            console.error("Delete admin help article error:", error)
            return res.status(500).json({ success: false, error: "Failed to delete help article" })
        }

        if (!deleted) {
            return res.status(404).json({ success: false, error: "Help article not found" })
        }

        await invalidateHelp()

        return res.status(200).json({
            success: true,
            data: { message: "Help article deleted successfully" },
        })
    } catch (err) {
        console.error("Error deleting admin help article:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
