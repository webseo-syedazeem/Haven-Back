import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { logger } from "./Logger.ts"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    logger.fatal("Supabase URL, ANON key, or service role key is missing")
    process.exit(1)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
})
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
})
export const supabaseUrlValue = supabaseUrl
export const supabaseAnonKeyValue = supabaseAnonKey

logger.info("Supabase client configured")
