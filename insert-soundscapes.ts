import { supabaseAdmin } from "./Config/Dbconnection.ts"
import { slugify, soundscapeMapping } from "./rename-soundscapes.ts"

const BASE_URL = "http://18.171.253.186"
const BATCH_SIZE = 50
const EXPECTED_TOTAL = 355
const AUDIO_EXTENSION = "m4a"

type SoundscapeInsert = {
    category: string
    subcategory: string
    title: string
    file_url: string
    created_at: string
}

const encodePathSegment = (segment: string) => encodeURIComponent(segment)

const buildSoundscapes = () => {
    const createdAt = new Date().toISOString()
    const records: SoundscapeInsert[] = []

    for (const [folderKey, audioNames] of Object.entries(soundscapeMapping)) {
        const [categoryName, subcategoryName] = folderKey.split("/")
        const category = categoryName
        const subcategory = subcategoryName
        const urlCategory = encodePathSegment(category)
        const urlSubcategory = encodePathSegment(subcategory)

        for (const title of audioNames) {
            const fileSlug = slugify(title)

            records.push({
                category,
                subcategory,
                title,
                file_url: `${BASE_URL}/soundscapes/${urlCategory}/${urlSubcategory}/${fileSlug}.${AUDIO_EXTENSION}`,
                created_at: createdAt,
            })
        }
    }

    return records
}

const insertInBatches = async (records: SoundscapeInsert[]) => {
    let totalInserted = 0

    for (let index = 0; index < records.length; index += BATCH_SIZE) {
        const batch = records.slice(index, index + BATCH_SIZE)
        const batchNumber = Math.floor(index / BATCH_SIZE) + 1

        const { error } = await supabaseAdmin.from("soundscapes").insert(batch)

        if (error) {
            throw new Error(`Batch ${batchNumber} failed: ${error.message}`)
        }

        totalInserted += batch.length
        console.log(`Inserted batch ${batchNumber}: ${batch.length} records`)
    }

    console.log(`Total inserted: ${totalInserted}`)
}

const main = async () => {
    const soundscapes = buildSoundscapes()

    if (soundscapes.length !== EXPECTED_TOTAL) {
        throw new Error(`Expected ${EXPECTED_TOTAL} records, generated ${soundscapes.length}`)
    }

    await insertInBatches(soundscapes)
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
