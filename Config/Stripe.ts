import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia" as any,
})

const PLAN_PRICE_MAP: Record<string, string> = {
    weekly: process.env.STRIPE_PRICE_WEEKLY!,
    monthly: process.env.STRIPE_PRICE_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_YEARLY!,
}

export { PLAN_PRICE_MAP }
