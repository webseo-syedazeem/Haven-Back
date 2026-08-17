import express from "express"
import { GetPlayerState, UpsertPlayerState } from "../Controller/Player.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const PlayerRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Player
 *     description: Persistent playback resume state
 */

/**
 * @swagger
 * /api/player/state:
 *   put:
 *     tags:
 *       - Player
 *     summary: Save the current playback position so the app can resume it later
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - soundscape_id
 *               - position_seconds
 *             properties:
 *               soundscape_id:
 *                 type: string
 *                 format: uuid
 *               position_seconds:
 *                 type: integer
 *                 minimum: 0
 *               duration_seconds:
 *                 type: integer
 *                 nullable: true
 *               queue:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               timer_minutes:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Player state saved successfully
 *       '400':
 *         description: Invalid player state
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlayerRoutes.put("/player/state", AuthMiddleware, UpsertPlayerState)

/**
 * @swagger
 * /api/player/state:
 *   get:
 *     tags:
 *       - Player
 *     summary: Get the authenticated user's saved playback state
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Player state returned successfully (null if never saved)
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlayerRoutes.get("/player/state", AuthMiddleware, GetPlayerState)

export default PlayerRoutes
