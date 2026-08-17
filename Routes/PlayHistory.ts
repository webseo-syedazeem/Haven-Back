import express from "express"
import { AddPlayHistory, GetPlayHistory } from "../Controller/PlayHistory.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const PlayHistoryRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Play History
 *     description: Soundscape play history routes
 */

/**
 * @swagger
 * /api/play-history:
 *   post:
 *     tags:
 *       - Play History
 *     summary: Record a play of a live soundscape
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
 *               position_seconds:
 *                 type: integer
 *                 minimum: 0
 *               completed:
 *                 type: boolean
 *               listened_seconds:
 *                 type: integer
 *                 minimum: 0
 *             required:
 *               - soundscape_id
 *     responses:
 *       '200':
 *         description: Play recorded successfully
 *       '400':
 *         description: Invalid or unavailable soundscape
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlayHistoryRoutes.post("/play-history", AuthMiddleware, AddPlayHistory)

/**
 * @swagger
 * /api/play-history:
 *   get:
 *     tags:
 *       - Play History
 *     summary: Get the authenticated user's 50 most recent plays
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Play history returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlayHistoryRoutes.get("/play-history", AuthMiddleware, GetPlayHistory)

export default PlayHistoryRoutes
