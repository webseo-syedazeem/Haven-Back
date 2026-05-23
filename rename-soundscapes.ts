import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import { createRequire } from "module"
import { pathToFileURL } from "url"
import { promisify } from "util"

const sourceRoot = path.join(process.cwd(), "300 sound scapes")
const outputRoot = path.join(process.cwd(), "public", "soundscapes")
const audioExtension = "m4a"
const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

export const soundscapeMapping: Record<string, string[]> = {
    "Calm/Anxiety Support": [
        "Anxiety Ease",
        "Soft Forest Calm",
        "Low Light",
        "Calm Body",
        "Ocean Grounding",
        "Rain for Overthinking",
        "Gentle Hold",
        "Safe Space",
    ],
    "Calm/Burnout Recovery": [
        "Slow Morning",
        "Nervous System Rest",
        "Recharge Slowly",
        "Burnout Rest",
        "Soft Focus Rest",
        "Low Energy Day",
        "Quiet Recovery",
        "Nothing to Do",
    ],
    "Calm/Emotional Reset": [
        "Warm Light",
        "Hopeful Morning",
        "Reset Breath",
        "Inner Quiet",
        "Emotional Release",
        "Soft Sadness",
        "Gentle Courage",
        "Heart Calm",
    ],
    "Calm/Grounding": [
        "Heavy Blanket",
        "Grounded Earth",
        "Stone & Water",
        "Forest Floor",
        "Rooted",
        "Barefoot Calm",
        "Mountain Stillness",
        "Body Anchor",
    ],
    "Calm/Stress Relief": [
        "After Work Reset",
        "Soft Shoulders",
        "Peaceful Rainfall",
        "Quiet Room",
        "Stress Melt",
        "Let Go",
        "Calm Commute",
        "Spa Reset",
    ],
    "Focus/ADHD-Friendly Focus": [
        "Calm Alert",
        "Sensory Shield",
        "ADHD Brown Noise",
        "Task Mode",
        "Low Distraction Loop",
        "Steady Mind",
        "Noise Blocker",
        "Smooth Focus Pulse",
    ],
    "Focus/Deep Work": [
        "Mental Clarity",
        "No Distractions",
        "Work Sprint",
        "Focus Tunnel",
        "Coding Flow",
        "Clear Desk",
        "Deep Work Brown Noise",
        "Concentration Pad",
    ],
    "Focus/Pomodoro Timed Focus": [
        "Work Reset Break",
        "25-Minute Focus Sprint",
        "Focus Start",
        "Creative Sprint",
        "90-Minute Flow",
        "50-Minute Deep Work",
        "Deep Flow",
        "Study Block",
    ],
    "Focus/Reading": [
        "Candlelight Pages",
        "Fireplace Reading",
        "Bookshop Rain",
        "Window Seat",
        "Sunday Reading",
        "Quiet Library",
    ],
    "Focus/Studying": [
        "Study Brown Noise",
        "Late Night Study",
        "Quiet Campus",
        "Exam Prep Calm",
        "Reading Rain",
        "Study Rain",
        "Memory Mode",
        "Library Focus",
    ],
    "Frequencies/Binaural Beats": [
        "Binaural Calm",
        "Binaural Focus",
        "Binaural Study",
        "Binaural Deep Sleep",
        "Binaural Clarity",
        "Binaural Ocean Calm",
        "Binaural Rain Sleep",
        "Binaural Meditation",
    ],
    "Frequencies/Brainwave-Inspired": [
        "Alpha Rain",
        "Beta Study Pad",
        "Gamma Clarity",
        "SMR Calm Attention",
        "Beta Focus",
        "Theta Meditation",
        "Delta Sleep",
        "Delta Brown Noise",
        "Alpha Calm Focus",
        "Theta Ocean",
    ],
    "Frequencies/Solfeggio-Inspired": [
        "852Hz Awareness",
        "741Hz Clarity",
        "396Hz Release",
        "285Hz Restore",
        "963Hz Stillness",
        "174Hz Deep Relief",
        "639Hz Connection",
        "417Hz Reset",
        "528Hz Harmony",
    ],
    "Frequencies/Tuning-Based Music": [
        "432Hz Sleep Pad",
        "Earth Resonance",
        "432Hz Handpan",
        "528Hz Ocean",
        "432Hz Piano Calm",
        "7.83Hz Inspired Grounding",
        "528Hz Warm Piano",
        "528Hz Heart Pad",
    ],
    "Meditate/Breath-Paced Non-Verbal": [
        "Box Breathing Tones",
        "Coherent Breathing",
        "Slow Exhale Rhythm",
        "Calm Breath Waves",
        "Grounding Pulse",
        "Nervous System Downshift",
        "Evening Breath",
        "Breath Bell",
    ],
    "Meditate/Mantra-Style Instrumental": [
        "Tanpura Drone",
        "Temple Drone",
        "Om-Inspired Tone",
        "Sacred Hum",
        "Heart Drone",
        "Soft Chant Texture",
    ],
    "Meditate/Sound Baths": [
        "Temple Sound Bath",
        "Crystal Bowl Bath",
        "Gong Wash",
        "Deep Gong Meditation",
        "Chakra Bowl Journey",
        "Floating Resonance",
        "Bowl & Rain",
        "Tibetan Bowl Stillness",
    ],
    "Meditate/Stillness": [
        "Zen Garden",
        "Inner Space",
        "Soft Silence",
        "Empty Room",
        "Pure Stillness",
        "Open Space",
        "Present Moment",
        "Quiet Mind",
    ],
    "Music/Flute Wind Instruments": [
        "Desert Flute",
        "Bamboo Flute Forest",
        "Ocean Flute",
        "Flute & Bowls",
        "Zen Flute",
        "Native Flute Calm",
        "Mountain Flute",
        "Sleep Flute",
    ],
    "Music/Handpan Tongue Drum": [
        "Soft Handpan",
        "Rain Handpan",
        "Handpan & Ocean",
        "Morning Handpan",
        "Grounding Handpan",
        "Night Handpan",
        "Tongue Drum Calm",
        "Handpan Sleep",
    ],
    "Music/Piano": [
        "Soft Keys",
        "Morning Piano",
        "Rain Piano",
        "Piano by the Window",
        "Emotional Piano",
        "Deep Rest Piano",
        "Minimal Piano",
        "Sleep Piano",
    ],
    "Music/Singing Bowls Gongs": [
        "Crystal Bowl Light",
        "Gong Bath Deep",
        "Deep Bowl Sleep",
        "Bowl Meditation Loop",
        "Bowl & Chimes",
        "Gong Calm",
        "Tibetan Bowl Drone",
        "Healing Bowl Atmosphere",
    ],
    "Music/Strings Guitar Harp": [
        "Guitar Rain",
        "Cello Drone",
        "Soft Acoustic",
        "Harp & Water",
        "Hopeful Strings",
        "Ambient Guitar",
        "Gentle Harp",
        "Soft Strings",
    ],
    "Nature/Birds & Animals": [
        "Meadow Life",
        "Countryside Morning",
        "Crickets",
        "Tropical Birds",
        "Frogs by the Pond",
        "Forest Animals",
        "Dawn Chorus",
        "Owls at Night",
        "Garden Birds",
        "Birdsong Morning",
    ],
    "Nature/Fire": [
        "Night Campfire",
        "Windy Campfire",
        "Cabin Fire",
        "Fireplace",
        "Fire and Rain",
        "Bonfire",
        "Campfire",
        "Soft Embers",
    ],
    "Nature/Forest": [
        "Morning Forest",
        "Woodland Birds",
        "Night Forest",
        "Deep Forest",
        "Forest Walk",
        "Tropical Forest",
        "Autumn Forest",
        "Forest Rain",
        "Pine Forest",
        "Forest Wind",
    ],
    "Nature/Ocean & Water": [
        "Waterfall",
        "Mountain Stream",
        "Forest Creek",
        "Lake Water",
        "River Flow",
        "Rain into Water",
        "Gentle Ocean Waves",
        "Calm Shore",
        "Crashing Waves",
        "Underwater Calm",
    ],
    "Nature/Rain": [
        "Rain on Tent",
        "Rain on Roof",
        "Night Rain",
        "Heavy Rain",
        "Light Rain",
        "Tropical Rain",
        "Forest Rain",
        "Rain on Window",
        "City Rain",
        "Rain and Thunder",
    ],
    "Nature/Wind & Weather": [
        "Winter Wind",
        "Rolling Thunder",
        "Desert Wind",
        "Distant Storm",
        "Soft Breeze",
        "Mountain Wind",
        "Wind Through Trees",
        "Coastal Wind",
        "Snowstorm",
        "Storm Shelter",
    ],
    "Noise/Colour Noise": [
        "Grey Noise",
        "Pure Pink Noise",
        "Blue Noise",
        "Pure Brown Noise",
        "Soft White Noise",
        "Violet Noise",
        "Green Noise",
        "Pure White Noise",
        "Soft Brown Noise",
        "Deep Pink Noise",
    ],
    "Noise/Fan & Machine Noise": [
        "Plane Cabin",
        "Bedroom Fan",
        "Air Conditioner",
        "Car Cabin Hum",
        "Washing Machine",
        "Air Purifier",
        "Dishwasher Hum",
        "Humidifier",
        "Box Fan",
        "Train Cabin",
    ],
    "Noise/Masking Sounds": [
        "Neighbour Noise Mask",
        "Tinnitus Mask Soft",
        "Snore Mask",
        "Office Blocker",
        "Sleep Masker",
        "Tinnitus Mask Warm",
        "Noise Shield",
        "Street Noise Mask",
    ],
    "Premixed/Calm Premixes": [
        "Overthinking Off",
        "Safe Space",
        "Nervous System Calm",
        "Grounded Forest",
        "Anxiety Reset",
        "Emotional Release",
        "Stress Melt",
        "Soft Heart",
    ],
    "Premixed/Focus Premixes": [
        "Exam Calm Focus",
        "Office Noise Blocker",
        "ADHD Focus Shield",
        "Deep Work Mode",
        "Coding Flow",
        "Reading Fireplace",
        "Creative Flow",
        "Study Rain Focus",
    ],
    "Premixed/Frequency Premixes": [
        "Grounding 396Hz",
        "432Hz Calm Piano",
        "528Hz Heart Harmony",
        "7.83Hz Schumann Grounding",
        "Clarity 741Hz",
        "Alpha Focus Rain",
        "Delta Rain Sleep",
        "Theta Ocean Meditation",
    ],
    "Premixed/Meditation Premixes": [
        "Zen Garden",
        "Temple Calm",
        "Breath Rhythm",
        "Inner Space",
        "Crystal Stillness",
        "Deep Sound Bath",
        "Root Grounding",
        "Floating Awareness",
    ],
    "Premixed/Nature Premixes": [
        "Spring Morning",
        "Desert Night",
        "Rainforest Retreat",
        "Lakeside Calm",
        "Ocean Storm",
        "Autumn Window",
        "Mountain Cabin",
        "Snowed In",
    ],
    "Premixed/Sleep Premixes": [
        "Deep Sleep Rain",
        "Warm Blanket Sleep",
        "Midnight Forest",
        "Stormy Night Sleep",
        "Cosy Cabin Sleep",
        "Ocean Bedtime",
        "Pink Noise Dreams",
        "Back to Sleep",
    ],
    "Sleep/Baby Family Sleep": [
        "Parent & Baby Rest",
        "Soft Fan for Baby Sleep",
        "Nursery Rain",
        "Womb-Like Rumble",
        "Baby Pink Noise",
        "Gentle Lullaby Piano",
    ],
    "Sleep/Deep Sleep": [
        "Fireplace Sleep",
        "Night Forest Sleep",
        "Brown Noise Sleep",
        "Delta Sleep Drone",
        "Soft Thunder Sleep",
        "Sleep Under the Stars",
        "Ocean Sleep Waves",
        "Deep Sleep Rain",
        "Pink Noise Sleep",
        "Dreamy Piano Sleep",
    ],
    "Sleep/Insomnia Support": [
        "Warm Blanket",
        "Back to Sleep Rain",
        "Restless Mind Reset",
        "Long Fade Sleep",
        "Midnight Ocean",
        "No Sudden Sounds",
        "3AM Calm",
        "Soft Darkness",
    ],
    "Sleep/Nap Mode": [
        "45-Minute Recovery Nap",
        "Sofa Nap",
        "Short Sleep Cycle",
        "30-Minute Reset Nap",
        "Afternoon Rest",
        "20-Minute Power Nap",
    ],
    "Sleep/Wind-Down": [
        "Slow Exhale",
        "Fireplace Wind-Down",
        "Cosy Cabin Night",
        "Evening Rain",
        "Bedtime Handpan",
        "Dimming Lights",
        "Sunset Piano",
        "Warm Bath Ambience",
    ],
}

type FileMapping = {
    oldPath: string
    newPath: string
    url: string
}

const encodePathSegment = (segment: string) => encodeURIComponent(segment)

export const slugify = (title: string) => {
    return title
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
}

const getSortedWavFiles = async (directory: string) => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true })

    return entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".wav")
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

const getFfmpegCommand = () => {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH
    }

    try {
        const ffmpegStaticPath = require("ffmpeg-static") as string | null

        if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) {
            return ffmpegStaticPath
        }
    } catch {
        // ffmpeg-static is optional; fall back to local/system installs below.
    }

    const localCandidates = [
        path.join(process.cwd(), "ffmpeg.exe"),
        path.join(process.cwd(), "tools", "ffmpeg", "bin", "ffmpeg.exe"),
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    ]

    for (const candidate of localCandidates) {
        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    return "ffmpeg"
}

// Is function ko purane convertWavToMp3 se replace kar dein
const convertWavToM4a = async (sourcePath: string, outputPath: string) => {
    const ffmpegCommand = getFfmpegCommand()

    try {
        await execFileAsync(ffmpegCommand, [
            "-y",
            "-i",
            sourcePath,
            "-vn",
            "-codec:a",
            "aac",        
            "-b:a",
            "256k",       
            "-map_metadata",
            "-1",
            outputPath,
        ])
    } catch (error) {
        throw new Error(
            `Failed to convert audio to M4A. Install ffmpeg-static locally, set FFMPEG_PATH, or install FFmpeg. Source: ${sourcePath}`
        )
    }
}

const copySoundscapes = async () => {
    if (!fs.existsSync(sourceRoot)) {
        throw new Error(`Source folder not found: ${sourceRoot}`)
    }

    const output: FileMapping[] = []

    for (const [folderKey, audioNames] of Object.entries(soundscapeMapping)) {
        const [categoryName, subcategoryName] = folderKey.split("/")
        const sourceDirectory = path.join(sourceRoot, categoryName, subcategoryName)

        if (!fs.existsSync(sourceDirectory)) {
            throw new Error(`Mapped source folder not found: ${sourceDirectory}`)
        }

        const files = await getSortedWavFiles(sourceDirectory)

        if (files.length !== audioNames.length) {
            throw new Error(
                `File count mismatch for ${folderKey}: found ${files.length}, expected ${audioNames.length}`
            )
        }

        const category = categoryName
        const subcategory = subcategoryName
        const urlCategory = encodePathSegment(category)
        const urlSubcategory = encodePathSegment(subcategory)
        const outputDirectory = path.join(outputRoot, category, subcategory)

        await fs.promises.mkdir(outputDirectory, { recursive: true })

        for (let index = 0; index < files.length; index += 1) {
            const title = audioNames[index]
            const fileSlug = slugify(title)
            const oldPath = path.join(sourceDirectory, files[index])
            const newFileName = `${fileSlug}.${audioExtension}`
            const newPath = path.join(outputDirectory, newFileName)
            const url = `/soundscapes/${urlCategory}/${urlSubcategory}/${newFileName}`

            if (fs.existsSync(newPath)) {
                console.log(`Skipped existing: ${newPath}`)
            } else {
                await convertWavToM4a(oldPath, newPath)
                console.log(`${oldPath} -> ${newPath}`)
            }

            output.push({
                oldPath,
                newPath,
                url,
            })
        }
    }

    console.log(JSON.stringify(output, null, 2))
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
    copySoundscapes().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    })
}
