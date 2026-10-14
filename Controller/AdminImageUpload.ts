import crypto from "crypto"
import fs from "fs"
import path from "path"
import type { NextFunction, Request, Response } from "express"
import multer from "multer"
import sharp from "sharp"
import { generateImageVariants } from "../lib/imageVariants.js"

const MAX_FILE_SIZE = 5 * 1024 * 1024
const WEBP_QUALITY = 90
const IMAGE_DIRECTORY_NAME = "passage_soundscape_images_webp"
const IMAGE_DIRECTORY = path.join(process.cwd(), "public", IMAGE_DIRECTORY_NAME)
const EXTENSIONS_BY_MIME_TYPE = new Map<string, ReadonlySet<string>>([
    ["image/jpeg", new Set(["jpg", "jpeg"])],
    ["image/png", new Set(["png"])],
    ["image/webp", new Set(["webp"])],
])

const getExtension = (filename: string) => path.extname(filename).slice(1).toLowerCase()

const safeBasename = (filename: string) => {
    const slug = path.parse(filename).name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)

    return slug || "passage-artwork"
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        const extension = getExtension(file.originalname)
        const allowedExtensions = EXTENSIONS_BY_MIME_TYPE.get(file.mimetype.toLowerCase())

        if (!allowedExtensions || !allowedExtensions.has(extension)) {
            callback(new Error("Supported image formats are jpg, jpeg, png and webp"))
            return
        }

        callback(null, true)
    },
}).single("image")

export const AdminImageUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (error) => {
        if (!error) {
            next()
            return
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, error: "Image must be 5MB or smaller" })
        }

        return res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : "Invalid image upload",
        })
    })
}

const VARIANT_DIRS = ["sm", "md", "lg"] as const

// Builds a candidate output filename. Combining a millisecond timestamp with an 8-char random
// hash makes collisions between two uploads astronomically unlikely on its own, but we still
// explicitly check for an existing file (see the retry loop below) before committing to a name.
// This matters because sm/md/lg variants are served with `Cache-Control: immutable` for a full
// year: if a re-upload ever reused an existing filename, devices that had already cached the
// old image under that exact URL would keep showing the stale artwork for up to a year. Always
// minting a brand-new filename (and therefore a brand-new URL) for any upload whose target name
// is already taken on disk sidesteps that entirely — a changed image is a new URL, never a
// cache-busted old one.
const buildCandidateFilename = (originalName: string) =>
    `${safeBasename(originalName)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`

const anyVariantExists = (directory: string, filename: string) =>
    VARIANT_DIRS.some((dir) => fs.existsSync(path.join(directory, dir, filename)))

const pickAvailableFilename = (directory: string, originalName: string) => {
    const MAX_ATTEMPTS = 5

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const candidate = buildCandidateFilename(originalName)
        const candidatePath = path.join(directory, candidate)

        if (!fs.existsSync(candidatePath) && !anyVariantExists(directory, candidate)) {
            return candidate
        }
    }

    throw new Error("Could not allocate a unique image filename")
}

export const createAdminImageHandler = (directory = IMAGE_DIRECTORY) => async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "image file is required" })
    }

    let filename: string
    try {
        filename = pickAvailableFilename(directory, req.file.originalname)
    } catch {
        return res.status(500).json({ success: false, error: "Failed to allocate a unique filename" })
    }
    const outputPath = path.join(directory, filename)
    const publicPath = `/${IMAGE_DIRECTORY_NAME}/${encodeURIComponent(filename)}`
    const variantPublicPath = (dir: (typeof VARIANT_DIRS)[number]) =>
        `/${IMAGE_DIRECTORY_NAME}/${dir}/${encodeURIComponent(filename)}`

    let webpBuffer: Buffer
    try {
        const image = sharp(req.file.buffer, { limitInputPixels: 40_000_000 })
        const metadata = await image.metadata()
        const actualMime = metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`
        if (!EXTENSIONS_BY_MIME_TYPE.has(actualMime) || actualMime !== req.file.mimetype.toLowerCase()) {
            return res.status(400).json({ success: false, error: "Image content does not match its declared format" })
        }
        webpBuffer = await image
            .rotate()
            .webp({ quality: WEBP_QUALITY, smartSubsample: true })
            .toBuffer()
    } catch {
        return res.status(400).json({ success: false, error: "Uploaded file could not be processed as an image" })
    }

    try {
        await fs.promises.mkdir(directory, { recursive: true })
        // `wx` fails loudly instead of silently overwriting on a race; pickAvailableFilename
        // already checked existence, so this should only ever trip on a concurrent request.
        await fs.promises.writeFile(outputPath, webpBuffer, { flag: "wx" })
    } catch (error) {
        console.error("Admin image save error:", error)
        return res.status(500).json({ success: false, error: "Failed to save uploaded image" })
    }

    // Best-effort: the original is already saved and the response below stays valid even if
    // this fails. Any image missing sm/md/lg variants can be backfilled later by running
    // scripts/generate-image-variants.js against the public folder.
    try {
        await generateImageVariants(webpBuffer, directory, filename)
    } catch (error) {
        console.error("Admin image variant generation error:", error)
    }

    const configuredServerUrl = process.env.SERVER_URL?.trim().replace(/\/+$/, "")
    const requestOrigin = `${req.protocol}://${req.get("host")}`
    const origin = configuredServerUrl || requestOrigin

    return res.status(201).json({
        success: true,
        data: {
            url: `${origin}${publicPath}`,
            sm_url: `${origin}${variantPublicPath("sm")}`,
            md_url: `${origin}${variantPublicPath("md")}`,
            lg_url: `${origin}${variantPublicPath("lg")}`,
        },
    })
}

export const UploadAdminImage = createAdminImageHandler()
