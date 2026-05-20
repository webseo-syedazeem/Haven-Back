import type { Request, Response } from "express"
import Stripe from "stripe"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { PLAN_PRICE_MAP, stripe } from "../Config/Stripe.ts"

const VALID_PLANS = ["weekly", "monthly", "yearly"]
const ACTIVE_STATUSES = ["active", "trialing"]

const getUserProfile = async (authUserId: string) => {
    return supabaseAdmin
        .from("users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .single()
}

const getSubscriptionPeriod = (subscription: Stripe.Subscription) => {
    const item = subscription.items.data[0]

    return {
        current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
        current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    }
}

export const CreateCheckout = async (req: Request, res: Response) => {
    const { plan } = req.body || {}
    const cleanPlan = String(plan || "").trim().toLowerCase()

    if (!VALID_PLANS.includes(cleanPlan)) {
        return res.status(400).json({ success: false, error: "Invalid plan" })
    }

    if (!PLAN_PRICE_MAP[cleanPlan]) {
        return res.status(500).json({ success: false, error: "Stripe price is not configured" })
    }

    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfile(user.id)

        if (profileError || !userProfile) {
            console.error("Create checkout profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: activeSubscription, error: activeSubscriptionError } = await supabaseAdmin
            .from("user_subscriptions")
            .select("id")
            .eq("user_id", userProfile.id)
            .in("status", ACTIVE_STATUSES)
            .limit(1)
            .maybeSingle()

        if (activeSubscriptionError) {
            console.error("Check active subscription error:", activeSubscriptionError)
            return res.status(500).json({ success: false, error: "Failed to check active subscription" })
        }

        if (activeSubscription) {
            return res.status(400).json({ success: false, error: "You already have an active subscription" })
        }

        const { data: existingCustomer, error: existingCustomerError } = await supabaseAdmin
            .from("user_subscriptions")
            .select("stripe_customer_id")
            .eq("user_id", userProfile.id)
            .not("stripe_customer_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (existingCustomerError) {
            console.error("Get Stripe customer error:", existingCustomerError)
            return res.status(500).json({ success: false, error: "Failed to get Stripe customer" })
        }

        let stripeCustomerId = existingCustomer?.stripe_customer_id

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email || undefined,
            })

            stripeCustomerId = customer.id
        }

        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ["card"],
            mode: "subscription",
            line_items: [{ price: PLAN_PRICE_MAP[cleanPlan], quantity: 1 }],
            subscription_data: cleanPlan === "yearly" ? { trial_period_days: 7 } : undefined,
            success_url: process.env.STRIPE_SUCCESS_URL,
            cancel_url: process.env.STRIPE_CANCEL_URL,
            metadata: { user_id: String(userProfile.id), plan: cleanPlan },
        })

        return res.status(200).json({ success: true, data: { checkout_url: session.url } })
    } catch (err) {
        console.error("Create checkout error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}

export const HandleWebhook = async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"]

    if (!sig) {
        return res.status(400).json({ success: false, error: "Missing Stripe signature" })
    }

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (err) {
        console.error("Stripe webhook signature error:", err)
        return res.status(400).json({ success: false, error: "Invalid Stripe signature" })
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session
            const userId = session.metadata?.user_id
            const plan = session.metadata?.plan
            const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id
            const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id

            if (!userId || !plan || !stripeSubscriptionId || !stripeCustomerId) {
                return res.status(400).json({ success: false, error: "Missing checkout session metadata" })
            }

            const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
            const period = getSubscriptionPeriod(subscription)

            const { error: upsertError } = await supabaseAdmin
                .from("user_subscriptions")
                .upsert(
                    {
                        user_id: Number(userId),
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: stripeSubscriptionId,
                        stripe_price_id: subscription.items.data[0]?.price.id,
                        plan,
                        status: subscription.status,
                        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                        current_period_start: period.current_period_start,
                        current_period_end: period.current_period_end,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                )

            if (upsertError) {
                console.error("Upsert subscription error:", upsertError)
                return res.status(500).json({ success: false, error: "Failed to save subscription" })
            }
        }

        if (event.type === "customer.subscription.updated") {
            const subscription = event.data.object as Stripe.Subscription
            const period = getSubscriptionPeriod(subscription)

            const { error: updateError } = await supabaseAdmin
                .from("user_subscriptions")
                .update({
                    status: subscription.status,
                    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
                    current_period_start: period.current_period_start,
                    current_period_end: period.current_period_end,
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", subscription.id)

            if (updateError) {
                console.error("Update subscription error:", updateError)
                return res.status(500).json({ success: false, error: "Failed to update subscription" })
            }
        }

        if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object as Stripe.Subscription

            const { error: deleteError } = await supabaseAdmin
                .from("user_subscriptions")
                .update({
                    status: "canceled",
                    updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", subscription.id)

            if (deleteError) {
                console.error("Cancel subscription webhook error:", deleteError)
                return res.status(500).json({ success: false, error: "Failed to cancel subscription" })
            }
        }

        return res.status(200).json({ success: true, data: { received: true } })
    } catch (err) {
        console.error("Handle webhook error:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
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

export const CancelSubscription = async (req: Request, res: Response) => {
    try {
        const user = req.user!
        const { data: userProfile, error: profileError } = await getUserProfile(user.id)

        if (profileError || !userProfile) {
            console.error("Cancel subscription profile error:", profileError)
            return res.status(401).json({ success: false, error: "User profile not found" })
        }

        const { data: subscription, error: subscriptionError } = await supabaseAdmin
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", userProfile.id)
            .in("status", ACTIVE_STATUSES)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (subscriptionError) {
            console.error("Find subscription to cancel error:", subscriptionError)
            return res.status(500).json({ success: false, error: "Failed to get subscription" })
        }

        if (!subscription) {
            return res.status(404).json({ success: false, error: "Active subscription not found" })
        }

        await stripe.subscriptions.cancel(subscription.stripe_subscription_id)

        const { error: updateError } = await supabaseAdmin
            .from("user_subscriptions")
            .update({
                status: "canceled",
                updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id)

        if (updateError) {
            console.error("Cancel subscription update error:", updateError)
            return res.status(500).json({ success: false, error: "Failed to update subscription" })
        }

        return res.status(200).json({ success: true, data: { message: "Subscription canceled successfully" } })
    } catch (err) {
        console.error("Error canceling subscription:", err)
        return res.status(500).json({ success: false, error: "Internal server error" })
    }
}
