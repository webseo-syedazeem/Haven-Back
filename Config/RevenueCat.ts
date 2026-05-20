const REVENUECAT_API_URL = "https://api.revenuecat.com/v1"
const REVENUECAT_SECRET_KEY = process.env.REVENUECAT_SECRET_KEY!

export const revenuecatHeaders = {
    Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`,
    "Content-Type": "application/json",
    "X-Platform": "ios",
}

export { REVENUECAT_API_URL }
