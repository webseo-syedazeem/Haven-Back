import express from "express"
import {
    AddAdminCollectionSoundscape,
    CreateAdminCollection,
    CreateAdminSoundscape,
    CreateAdminSoundscapeTagEvent,
    DeleteAdminRemoteConfig,
    DeleteAdminSoundscape,
    GetAdminCollections,
    GetAdminRemoteConfig,
    GetAdminSoundscapeTagEvents,
    GetAdminSoundscapes,
    GetOneAdminCollection,
    GetOneAdminRemoteConfig,
    GetOneAdminSoundscape,
    GetPublicRemoteConfig,
    PublishAdminCollection,
    RemoveAdminCollectionSoundscape,
    ReviseAdminSoundscape,
    UpdateAdminCollection,
    UpdateAdminSoundscape,
    UpdateAdminSoundscapeStatus,
    UpsertAdminRemoteConfig,
} from "../Controller/Admin.ts"
import { AdminImageUploadMiddleware, UploadAdminImage } from "../Controller/AdminImageUpload.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import { AdminAuthMiddleware } from "../Middleware/AdminAuthMiddleware.ts"

const AdminRoutes = express.Router()
const requireAdmin = [AuthMiddleware, AdminAuthMiddleware] as const

/**
 * @swagger
 * /api/admin/upload-image:
 *   post:
 *     tags: [Admin]
 *     summary: Upload a collection cover image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       '201': { description: Image uploaded and public URL returned }
 *       '400': { description: Missing, unsupported, or oversized image }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 */
AdminRoutes.post("/admin/upload-image", ...requireAdmin, AdminImageUploadMiddleware, UploadAdminImage)

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Temporary authenticated catalogue administration routes
 *   - name: Remote Config
 *     description: Public verified remote configuration values
 */

/**
 * @swagger
 * /api/admin/soundscapes:
 *   post:
 *     tags: [Admin]
 *     summary: Create an idea-stage soundscape
 *     description: Status is always forced to idea. Any authenticated user currently has access.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode, subcategory, title]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *               subcategory:
 *                 type: string
 *               title:
 *                 type: string
 *               short_title:
 *                 type: string
 *               one_line_description:
 *                 type: string
 *               designed_for:
 *                 type: string
 *               best_use:
 *                 type: string
 *               artwork_url:
 *                 type: string
 *               contains:
 *                 type: array
 *                 items: { type: string }
 *               does_not_contain:
 *                 type: array
 *                 items: { type: string }
 *               animals:
 *                 type: array
 *                 items: { type: string }
 *               instruments:
 *                 type: array
 *                 items: { type: string }
 *               human_presence:
 *                 type: boolean
 *               perspective:
 *                 type: string
 *               movement:
 *                 type: string
 *               intensity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               detail_level:
 *                 type: string
 *                 enum: [minimal, gentle, balanced, rich]
 *               sound_sources:
 *                 type: array
 *                 items: { type: string }
 *               duration_seconds:
 *                 type: integer
 *               is_loop:
 *                 type: boolean
 *               file_url:
 *                 type: string
 *               preview_url:
 *                 type: string
 *                 description: Short (~1 minute) preview clip URL, distinct from file_url.
 *               file_size_bytes:
 *                 type: integer
 *               search_keywords:
 *                 type: array
 *                 items: { type: string }
 *               sort_score:
 *                 type: integer
 *               science_label:
 *                 type: string
 *               science_note:
 *                 type: string
 *               catalogue_ref:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Idea-stage soundscape created
 *       '400':
 *         description: Invalid soundscape input
 *       '401':
 *         description: Invalid or missing session
 *   get:
 *     tags: [Admin]
 *     summary: List all soundscapes, including unpublished rows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [idea, briefed, generating, editing, audio_qa, metadata_qa, app_qa, live, on_hold]
 *     responses:
 *       '200':
 *         description: Soundscapes returned successfully
 *       '400':
 *         description: Invalid status filter
 *       '401':
 *         description: Invalid or missing session
 */
AdminRoutes.post("/admin/soundscapes", ...requireAdmin, CreateAdminSoundscape)
AdminRoutes.get("/admin/soundscapes", ...requireAdmin, GetAdminSoundscapes)

/**
 * @swagger
 * /api/admin/soundscapes/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get one soundscape regardless of status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Soundscape returned successfully }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 *   put:
 *     tags: [Admin]
 *     summary: Partially update editable soundscape fields
 *     description: A supplied status field is ignored; use the dedicated status endpoint.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200': { description: Soundscape updated successfully }
 *       '400': { description: Invalid update }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 *   delete:
 *     tags: [Admin]
 *     summary: Permanently delete an idea-stage soundscape
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Idea-stage soundscape deleted }
 *       '400': { description: Soundscape is not at the idea stage }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 */
AdminRoutes.get("/admin/soundscapes/:id", ...requireAdmin, GetOneAdminSoundscape)
AdminRoutes.put("/admin/soundscapes/:id", ...requireAdmin, UpdateAdminSoundscape)
AdminRoutes.delete("/admin/soundscapes/:id", ...requireAdmin, DeleteAdminSoundscape)

/**
 * @swagger
 * /api/admin/soundscapes/{id}/status:
 *   put:
 *     tags: [Admin]
 *     summary: Change a soundscape's catalogue status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [idea, briefed, generating, editing, audio_qa, metadata_qa, app_qa, live, on_hold]
 *     responses:
 *       '200': { description: Status updated successfully }
 *       '400': { description: Invalid status }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 */
AdminRoutes.put("/admin/soundscapes/:id/status", ...requireAdmin, UpdateAdminSoundscapeStatus)

/**
 * @swagger
 * /api/admin/soundscapes/{id}/revise:
 *   post:
 *     tags: [Admin]
 *     summary: Duplicate a soundscape into a new idea-stage revision
 *     description: Creates a new idea-stage row with version_of set to the original id. Does not change the original status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '201': { description: Idea-stage revision created }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 */
AdminRoutes.post("/admin/soundscapes/:id/revise", ...requireAdmin, ReviseAdminSoundscape)

/**
 * @swagger
 * /api/admin/soundscapes/{id}/tag-events:
 *   get:
 *     tags: [Admin]
 *     summary: List tag governance events for a soundscape
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Tag event history returned }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 *   post:
 *     tags: [Admin]
 *     summary: Log a tag governance event for a soundscape
 *     description: Records intended/generated/detected/verified lifecycle for a tag claim. Does not change denormalized filter arrays.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag_group, tag_value, state]
 *             properties:
 *               tag_group:
 *                 type: string
 *                 enum: [contains, does_not_contain, animals, instruments, sound_sources, search_keywords]
 *               tag_value: { type: string }
 *               state:
 *                 type: string
 *                 enum: [intended, generated, detected, verified]
 *               source: { type: string, nullable: true }
 *     responses:
 *       '201': { description: Tag event created }
 *       '400': { description: Invalid tag event input }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Soundscape not found }
 */
AdminRoutes.get("/admin/soundscapes/:id/tag-events", ...requireAdmin, GetAdminSoundscapeTagEvents)
AdminRoutes.post("/admin/soundscapes/:id/tag-events", ...requireAdmin, CreateAdminSoundscapeTagEvent)

/**
 * @swagger
 * /api/admin/collections:
 *   post:
 *     tags: [Admin]
 *     summary: Create an unpublished collection
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, title]
 *             properties:
 *               slug: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               cover_image_url: { type: string }
 *               mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *               explore_group:
 *                 type: string
 *                 enum: [nature, indoor, travel, animals, instruments, weather, situation, editorial]
 *               sort_order: { type: integer, minimum: 0 }
 *     responses:
 *       '201': { description: Unpublished collection created }
 *       '400': { description: Invalid input or duplicate slug }
 *       '401': { description: Invalid or missing session }
 *   get:
 *     tags: [Admin]
 *     summary: List all collections with member counts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200': { description: Collections returned successfully }
 *       '401': { description: Invalid or missing session }
 */
AdminRoutes.post("/admin/collections", ...requireAdmin, CreateAdminCollection)
AdminRoutes.get("/admin/collections", ...requireAdmin, GetAdminCollections)

/**
 * @swagger
 * /api/admin/collections/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a collection with all members regardless of publication status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Collection and ordered members returned }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Collection not found }
 *   put:
 *     tags: [Admin]
 *     summary: Partially update a collection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '200': { description: Collection updated successfully }
 *       '400': { description: Invalid update or duplicate slug }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Collection not found }
 */
AdminRoutes.get("/admin/collections/:id", ...requireAdmin, GetOneAdminCollection)
AdminRoutes.put("/admin/collections/:id", ...requireAdmin, UpdateAdminCollection)

/**
 * @swagger
 * /api/admin/collections/{id}/publish:
 *   put:
 *     tags: [Admin]
 *     summary: Publish or unpublish a collection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_published]
 *             properties:
 *               is_published: { type: boolean }
 *     responses:
 *       '200': { description: Publication state updated }
 *       '400': { description: Invalid publication state }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Collection not found }
 */
AdminRoutes.put("/admin/collections/:id/publish", ...requireAdmin, PublishAdminCollection)

/**
 * @swagger
 * /api/admin/collections/{id}/soundscapes:
 *   post:
 *     tags: [Admin]
 *     summary: Add any soundscape to a collection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [soundscape_id]
 *             properties:
 *               soundscape_id: { type: string, format: uuid }
 *               sort_order: { type: integer, minimum: 0 }
 *     responses:
 *       '201': { description: Soundscape added to collection }
 *       '400': { description: Invalid input, missing soundscape, or duplicate membership }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Collection not found }
 */
AdminRoutes.post(
    "/admin/collections/:id/soundscapes",
    ...requireAdmin,
    AddAdminCollectionSoundscape
)

/**
 * @swagger
 * /api/admin/collections/{id}/soundscapes/{soundscapeId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Remove a soundscape from a collection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: soundscapeId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Soundscape removed from collection }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Collection or membership not found }
 */
AdminRoutes.delete(
    "/admin/collections/:id/soundscapes/:soundscapeId",
    ...requireAdmin,
    RemoveAdminCollectionSoundscape
)

/**
 * @swagger
 * /api/admin/remote-config:
 *   get:
 *     tags: [Admin]
 *     summary: List all remote config entries including unverified placeholders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200': { description: Remote config entries returned }
 *       '401': { description: Invalid or missing session }
 */
AdminRoutes.get("/admin/remote-config", ...requireAdmin, GetAdminRemoteConfig)

/**
 * @swagger
 * /api/admin/remote-config/{key}:
 *   get:
 *     tags: [Admin]
 *     summary: Get one remote config entry by key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200': { description: Entry returned }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Key not found }
 *   put:
 *     tags: [Admin]
 *     summary: Create or update a remote config entry
 *     description: Upserts on key. is_verified defaults to false on create and only changes on update when explicitly supplied.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: {}
 *               is_verified: { type: boolean }
 *     responses:
 *       '200': { description: Entry updated }
 *       '201': { description: Entry created }
 *       '400': { description: Invalid input }
 *       '401': { description: Invalid or missing session }
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a remote config entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200': { description: Entry deleted }
 *       '401': { description: Invalid or missing session }
 *       '404': { description: Key not found }
 */
AdminRoutes.get("/admin/remote-config/:key", ...requireAdmin, GetOneAdminRemoteConfig)
AdminRoutes.put("/admin/remote-config/:key", ...requireAdmin, UpsertAdminRemoteConfig)
AdminRoutes.delete("/admin/remote-config/:key", ...requireAdmin, DeleteAdminRemoteConfig)

/**
 * @swagger
 * /api/remote-config/{key}:
 *   get:
 *     tags: [Remote Config]
 *     summary: Get a verified public remote config value
 *     description: Returns 404 unless the entry exists and is_verified is true.
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       '200': { description: Verified value returned }
 *       '404': { description: Missing or unverified }
 */
AdminRoutes.get("/remote-config/:key", GetPublicRemoteConfig)

export default AdminRoutes
