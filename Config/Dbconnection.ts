import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error("Supabase URL, ANON key, or SERVICE ROLE key is missing in environment variables.")
    process.exit(1)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
export const supabaseUrlValue = supabaseUrl
export const supabaseAnonKeyValue = supabaseAnonKey

console.log("Supabase connected successfully")
