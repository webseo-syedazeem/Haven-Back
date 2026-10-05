import crypto from "crypto"
import fs from "fs"
import path from "path"
import type { NextFunction, Request, Response } from "express"
import multer from "multer"
import sharp from "sharp"

const MAX_FILE_SIZE = 5 * 1024 * 1024
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

    return slug || "collection-cover"
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

export const UploadAdminImage = async (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "image file is required" })
    }

    const filename = `${safeBasename(req.file.originalname)}-${Date.now()}-${crypto.randomUUID()}.webp`
    const outputPath = path.join(IMAGE_DIRECTORY, filename)
    const publicPath = `/${IMAGE_DIRECTORY_NAME}/${encodeURIComponent(filename)}`

    let webpBuffer: Buffer
    try {
        webpBuffer = await sharp(req.file.buffer)
            .rotate()
            .webp({ quality: 85 })
            .toBuffer()
    } catch (error) {
        console.error("Admin image conversion error:", error)
        return res.status(400).json({ success: false, error: "Uploaded file could not be processed as an image" })
    }

    try {
        await fs.promises.mkdir(IMAGE_DIRECTORY, { recursive: true })
        await fs.promises.writeFile(outputPath, webpBuffer, { flag: "wx" })
    } catch (error) {
        console.error("Admin image save error:", error)
        return res.status(500).json({ success: false, error: "Failed to save uploaded image" })
    }

    const configuredServerUrl = process.env.SERVER_URL?.trim().replace(/\/+$/, "")
    const requestOrigin = `${req.protocol}://${req.get("host")}`

    return res.status(201).json({
        success: true,
        data: {
            url: `${configuredServerUrl || requestOrigin}${publicPath}`,
        },
    })
}
