import type { Request, Response } from "express"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { REVENUECAT_API_URL, revenuecatHeaders } from "../Config/RevenueCat.ts"

type RevenueCatEvent = {
    type?: string
    app_user_id?: string
    product_id?: string
    period_type?: string
    expiration_at_ms?: number
    purchased_at_ms?: number
    is_trial_period?: boolean
}

type RevenueCatEntitlement = {
    expires_date?: string | null
    purchase_date?: string | null
    product_identifier?: string
    period_type?: string
}

type RevenueCatSubscription = {
    expires_date?: string | null
    purchase_date?: string | null
    product_identifier?: string
    period_type?: string
}

const mapPlan = (periodType?: string) => {
    const cleanPeriodType = String(periodType || "").trim().toUpperCase()

    if (cleanPeriodType === "WEEKLY") return "weekly"
    if (cleanPeriodType === "MONTHLY") return "monthly"
    if (cleanPeriodType === "ANNUAL") return "yearly"

    return "monthly"
}

const msToIso = (value?: number) => {
    if (!value) return null
    return new Date(value).toISOString()
}

const dateToIso = (value?: string | null) => {
    if (!value) return null
    return new Date(value).toISOString()
}

const parseRevenueCatBody = (body: unknown) => {
    if (Buffer.isBuffer(body)) {
        return JSON.parse(body.toString("utf8"))
    }

    if (typeof body === "string") {
        return JSON.parse(body)
    }

    return body as { event?: RevenueCatEvent }
}

const getUserProfile = async (authUserId: string) => {
    return supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single()
}

const upsertWebhookSubscription = async (event: RevenueCatEvent, status: string) => {
    const appUserId = String(event.app_user_id || "").trim()

    if (!appUserId) {
        return { error: "Missing RevenueCat app user id" }
    }

    const { data: userProfile, error: profileError } = await getUserProfile(appUserId)

    if (profileError || !userProfile) {
        console.error("RevenueCat webhook profile error:", profileError)
        return { error: "User profile not found" }
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert(
            {
                user_id: userProfile.id,
                revenuecat_customer_id: appUserId,
                product_id: event.product_id,
                plan: mapPlan(event.period_type),
                status,
                trial_end: status === "trialing" ? msToIso(event.expiration_at_ms) : null,
                current_period_start: msToIso(event.purchased_at_ms),
                current_period_end: msToIso(event.expiration_at_ms),
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        )
        .select("*")
        .single()

    if (subscriptionError) {
        console.error("RevenueCat webhook upsert error:", subscriptionError)
        return { error: "Failed to save subscription" }
    }

    return { subscription }
}

const updateRevenueCatSubscriptionStatus = async (revenuecatCustomerId: string, status: string) => {
    const { error } = await supabaseAdmin
        .from("user_subscriptions")
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq("revenuecat_customer_id", revenuecatCustomerId)

    return error
}

const findActiveEntitlement = (entitlements: Record<string, RevenueCatEntitlement> = {}) => {
    const now = Date.now()

    return Object.values(entitlements).find((entitlement) => {
        if (!entitlement.expires_date) return true
        return new Date(entitlement.expires_date).getTime() > now
    })
}

const findSubscriptionForProduct = (
    subscriptions: Record<string, RevenueCatSubscription> = {},
    productId?: string
) => {
    if (productId && subscriptions[productId]) {
        return subscriptions[productId]
    }

    return Object.values(subscriptions)[0]
}

export const GetSubscription = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await getUserProfile(user.id)

        if (profileError || !userProfile) {
            console.error("Get subscription profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: subscription, error: subscriptionError } = await supabaseAdmin
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", userProfile.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (subscriptionError) {
            console.error("Get subscription error:", subscriptionError)
            return res.status(500).json({ success: false, error: "Failed to get subscription" })
        }

        return res.status(200).json({ success: true, data: { subscription: subscription || null } })
    } catch (err) {
        console.error("Error getting subscription:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const HandleWebhook = async (req: Request, res: Response) => {
    const authorization = String(req.headers.authorization || "").trim()

    if (authorization !== process.env.REVENUECAT_SECRET_KEY) {
        return res.status(401).json({ success: false, error: "Unauthorized webhook" })
    }

    try {
        const payload = parseRevenueCatBody(req.body)
        const event = payload?.event
        const eventType = String(event?.type || "").trim().toUpperCase()

        if (!event) {
            return res.status(400).json({ success: false, error: "Missing RevenueCat event" })
        }

        if (eventType === "INITIAL_PURCHASE" || eventType === "RENEWAL") {
            const result = await upsertWebhookSubscription(event, event.is_trial_period ? "trialing" : "active")

            if (result.error) {
                return res.status(500).json({ success: false, error: result.error })
            }
        }

        if (eventType === "TRIAL_STARTED") {
            const result = await upsertWebhookSubscription(event, "trialing")

            if (result.error) {
                return res.status(500).json({ success: false, error: result.error })
            }
        }

        if (eventType === "CANCELLATION" || eventType === "TRIAL_CANCELLED") {
            const appUserId = String(event.app_user_id || "").trim()
            const updateError = await updateRevenueCatSubscriptionStatus(appUserId, "canceled")

            if (updateError) {
                console.error("RevenueCat cancellation update error:", updateError)
                return res.status(500).json({ success: false, error: "Failed to cancel subscription" })
            }
        }

        if (eventType === "EXPIRATION") {
            const appUserId = String(event.app_user_id || "").trim()
            const updateError = await updateRevenueCatSubscriptionStatus(appUserId, "inactive")

            if (updateError) {
                console.error("RevenueCat expiration update error:", updateError)
                return res.status(500).json({ success: false, error: "Failed to expire subscription" })
            }
        }

        if (eventType === "TRIAL_CONVERTED") {
            const appUserId = String(event.app_user_id || "").trim()
            const updateError = await updateRevenueCatSubscriptionStatus(appUserId, "active")

            if (updateError) {
                console.error("RevenueCat trial converted update error:", updateError)
                return res.status(500).json({ success: false, error: "Failed to update subscription" })
            }
        }

        return res.status(200).json({ success: true, data: { received: true } })
    } catch (err) {
        console.error("Handle RevenueCat webhook error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const SyncSubscription = async (req: Request, res: Response) => {
    try {
        const user = req.user!

        const { data: userProfile, error: profileError } = await getUserProfile(user.id)

        if (profileError || !userProfile) {
            console.error("Sync subscription profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const response = await fetch(`${REVENUECAT_API_URL}/subscribers/${user.id}`, {
            method: "GET",
            headers: revenuecatHeaders,
        })

        if (!response.ok) {
            console.error("RevenueCat sync API error:", response.status, await response.text())
            return res.status(500).json({ success: false, error: "Failed to sync subscription" })
        }

        const data = await response.json()
        const subscriber = data?.subscriber || {}
        const entitlement = findActiveEntitlement(subscriber.entitlements)

        if (!entitlement) {
            return res.status(200).json({ success: true, data: { subscription: null } })
        }

        const revenueCatSubscription = findSubscriptionForProduct(
            subscriber.subscriptions,
            entitlement.product_identifier
        )

        const productId = entitlement.product_identifier || revenueCatSubscription?.product_identifier
        const purchaseDate = entitlement.purchase_date || revenueCatSubscription?.purchase_date
        const expiresDate = entitlement.expires_date || revenueCatSubscription?.expires_date
        const periodType = entitlement.period_type || revenueCatSubscription?.period_type

        const { data: subscription, error: subscriptionError } = await supabaseAdmin
            .from("user_subscriptions")
            .upsert(
                {
                    user_id: userProfile.id,
                    revenuecat_customer_id: user.id,
                    product_id: productId,
                    plan: mapPlan(periodType),
                    status: "active",
                    trial_end: null,
                    current_period_start: dateToIso(purchaseDate),
                    current_period_end: dateToIso(expiresDate),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            )
            .select("*")
            .single()

        if (subscriptionError) {
            console.error("Sync subscription upsert error:", subscriptionError)
            return res.status(500).json({ success: false, error: "Failed to save subscription" })
        }

        return res.status(200).json({ success: true, data: { subscription } })
    } catch (err) {
        console.error("Error syncing subscription:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
