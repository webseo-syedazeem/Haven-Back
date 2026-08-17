import express from "express"
import {
    CreateDownload,
    DeleteAllDownloads,
    DeleteDownload,
    GetDownloads,
    GetDownloadsStorage,
    UpdateDownloadStatus,
} from "../Controller/Downloads.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const DownloadsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Downloads
 *     description: Authenticated soundscape download records
 */

/**
 * @swagger
 * /api/downloads:
 *   post:
 *     tags:
 *       - Downloads
 *     summary: Queue a live soundscape for download
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               soundscape_id:
 *                 type: string
 *                 format: uuid
 *               quality:
 *                 type: string
 *                 enum: [standard, high]
 *                 default: standard
 *             required:
 *               - soundscape_id
 *     responses:
 *       '200':
 *         description: Download created or reset to queued successfully
 *       '400':
 *         description: Invalid quality or unavailable soundscape
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.post("/downloads", AuthMiddleware, CreateDownload)

/**
 * @swagger
 * /api/downloads:
 *   get:
 *     tags:
 *       - Downloads
 *     summary: Get the authenticated user's downloads
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Downloads returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.get("/downloads", AuthMiddleware, GetDownloads)

/**
 * @swagger
 * /api/downloads/storage:
 *   get:
 *     tags:
 *       - Downloads
 *     summary: Get the authenticated user's total download storage use
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Download storage totals returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.get("/downloads/storage", AuthMiddleware, GetDownloadsStorage)

/**
 * @swagger
 * /api/downloads:
 *   delete:
 *     tags:
 *       - Downloads
 *     summary: Delete all of the authenticated user's download records (remove all)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: All download records deleted successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.delete("/downloads", AuthMiddleware, DeleteAllDownloads)

/**
 * @swagger
 * /api/downloads/{soundscapeId}/status:
 *   put:
 *     tags:
 *       - Downloads
 *     summary: Update a soundscape download status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: soundscapeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [queued, downloading, completed, failed]
 *               progress_percent:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *               downloaded_bytes:
 *                 type: integer
 *                 minimum: 0
 *             required:
 *               - status
 *     responses:
 *       '200':
 *         description: Download status updated successfully
 *       '400':
 *         description: Invalid download status
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Download not found
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.put("/downloads/:soundscapeId/status", AuthMiddleware, UpdateDownloadStatus)

/**
 * @swagger
 * /api/downloads/{soundscapeId}:
 *   delete:
 *     tags:
 *       - Downloads
 *     summary: Delete a soundscape download record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: soundscapeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Download record deleted successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Download not found
 *       '500':
 *         description: Server error
 */
DownloadsRoutes.delete("/downloads/:soundscapeId", AuthMiddleware, DeleteDownload)

export default DownloadsRoutes
