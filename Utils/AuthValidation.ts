import type { Response } from "express"

type Code = "VALIDATION_ERROR" | "INVALID_AUTH_HEADER" | "ALREADY_AUTHENTICATED" | "EMAIL_ALREADY_REGISTERED" | "EMAIL_NOT_REGISTERED" | "INVALID_CREDENTIALS" | "EMAIL_NOT_CONFIRMED" | "INVALID_TOKEN" | "RATE_LIMITED" | "PROFILE_NOT_FOUND" | "PROFILE_IMAGE_NOT_FOUND" | "AUTH_USER_NOT_FOUND" | "AUTH_ERROR" | "DATABASE_ERROR" | "INTERNAL_SERVER_ERROR"

export const authError = (
    res: Response,
    status: number,
    code: Code,
    error: string,
    details?: Record<string, string>,
) => res.status(status).json({ success: false, error, code, ...(details ? { details } : {}) })

export const emailIssue = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "email is required"
    const email = value.trim()
    return email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? "email must be a valid email address" : null
}

export const passwordIssue = (value: unknown, field: string, strong: boolean) => {
    if (typeof value !== "string" || !value) return field + " is required"
    if (value.length > 72) return field + " must not exceed 72 characters"
    if (!strong) return null
    if (value.length < 8) return field + " must be at least 8 characters long"
    return !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)
        ? field + " must contain an uppercase letter, a lowercase letter, and a number" : null
}

export const nameIssue = (value: unknown, field: string, min = 1) => {
    if (typeof value !== "string" || !value.trim()) return field + " is required"
    const name = value.trim()
    if (name.length < min || name.length > 50) return field + " must be between " + min + " and 50 characters"
    return /[\u0000-\u001F\u007F]/.test(name) ? field + " contains invalid characters" : null
}

export const tokenIssue = (value: unknown, field: string) => {
    if (typeof value !== "string" || !value.trim()) return field + " is required"
    return value.trim().length > 20_000 ? field + " is too long" : null
}
