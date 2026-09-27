import type { NextFunction, Request, Response } from "express"
import multer from "multer"
import { supabaseAdmin } from "../Config/Dbconnection.ts"
import { authError } from "../Utils/AuthValidation.ts"

const MAX_FILE_SIZE = 5 * 1024 * 1024
const AVATAR_BUCKET = "avatars"
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"])
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
    },
    fileFilter: (req, file, callback) => {
        const extension = getExtension(file.originalname)

        if (!extension || !SUPPORTED_EXTENSIONS.has(extension) || !SUPPORTED_MIME_TYPES.has(file.mimetype)) {
            callback(new Error("Supported image formats are jpg, jpeg, png and webp"))
            return
        }

        callback(null, true)
    },
}).single("image")

const getExtension = (filename: string) => {
    const extension = filename.split(".").pop()
    return extension ? extension.toLowerCase() : ""
}

export const ProfileImageUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
        if (!err) {
            next()
            return
        }

        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return authError(res, 400, "VALIDATION_ERROR", "Image must be 5MB or smaller", {
                image: "Maximum allowed image size is 5MB",
            })
        }

        return authError(res, 400, "VALIDATION_ERROR", err instanceof Error ? err.message : "Invalid image upload")
    })
}

export const UploadProfileImage = async (req: Request, res: Response) => {
    const file = req.file

    if (!file) {
        return authError(res, 400, "VALIDATION_ERROR", "image file is required", { image: "image file is required" })
    }

    try {
        const user = req.user!
        const extension = getExtension(file.originalname)
        const timestamp = Date.now()
        const storagePath = `${user.id}/${timestamp}.${extension}`

        // Capture existing files BEFORE uploading the new one
        const { data: existingFiles, error: listError } = await supabaseAdmin.storage
            .from(AVATAR_BUCKET)
            .list(user.id)

        if (listError) {
            console.error("List existing profile images error:", listError)
        }

        const { error: uploadError } = await supabaseAdmin.storage
            .from(AVATAR_BUCKET)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            })

        if (uploadError) {
            console.error("Upload profile image storage error:", uploadError)
            return authError(res, 500, "DATABASE_ERROR", "Failed to upload profile image")
        }

        const { data: publicUrlData } = supabaseAdmin.storage
            .from(AVATAR_BUCKET)
            .getPublicUrl(storagePath)

        const profileImageUrl = publicUrlData.publicUrl

        const { data: updatedProfile, error: updateError } = await supabaseAdmin
            .from("users")
            .update({
                profile_image_url: profileImageUrl,
                updated_at: new Date().toISOString(),
            })
            .eq("auth_user_id", user.id)
            .select("profile_image_url")
            .maybeSingle()

        if (updateError || !updatedProfile) {
            console.error("Upload profile image profile update error:", updateError)
            await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([storagePath])
            return updateError
                ? authError(res, 500, "DATABASE_ERROR", "Failed to update profile image")
                : authError(res, 404, "PROFILE_NOT_FOUND", "User profile not found")
        }

        // New image saved + DB updated: now clean up the old files
        if (existingFiles && existingFiles.length > 0) {
            const oldPaths = existingFiles
                .map((item) => `${user.id}/${item.name}`)
                .filter((path) => path !== storagePath)

            if (oldPaths.length > 0) {
                const { error: removeError } = await supabaseAdmin.storage
                    .from(AVATAR_BUCKET)
                    .remove(oldPaths)

                if (removeError) {
                    console.error("Failed to remove old profile images:", removeError)
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                profile_image_url: profileImageUrl,
            },
        })
    } catch (err) {
        console.error("Error uploading profile image:", err)
        return authError(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error")
    }
}
