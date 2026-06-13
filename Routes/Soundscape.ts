import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    CreateMix,
    DeleteMix,
    GetAllSoundscapes,
    GetOneMix,
    GetOneSoundscape,
    GetSoundscapesByCategory,
    GetUserMixes,
    RecordMixPlay,
    ToggleMixFavorite,
    UpdateMix,
} from "../Controller/Soundscape.ts"

const SoundscapeRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Soundscapes
 *     description: Soundscape and saved mix routes
 */

/**
 * @swagger
 * /api/soundscapes:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get all soundscapes grouped by category
 *     responses:
 *       '200':
 *         description: Soundscapes returned successfully
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes", GetAllSoundscapes)

/**
 * @swagger
 * /api/soundscapes/mix:
 *   post:
 *     tags:
 *       - Soundscapes
 *     summary: Create a soundscape mix for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - soundscape_ids
 *             properties:
 *               name:
 *                 type: string
 *                 example: Evening calm mix
 *               soundscape_ids:
 *                 type: array
 *                 minItems: 2
 *                 maxItems: 6
 *                 items:
 *                   type: string
 *                   format: uuid
 *               volumes:
 *                 type: object
 *                 example:
 *                   00000000-0000-0000-0000-000000000000: 0.8
 *                   11111111-1111-4111-8111-111111111111: 0.5
 *     responses:
 *       '201':
 *         description: Soundscape mix created successfully
 *       '400':
 *         description: Missing or invalid soundscape mix data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.post("/soundscapes/mix", AuthMiddleware, CreateMix)

/**
 * @swagger
 * /api/soundscapes/mix:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get saved soundscape mixes for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Soundscape mixes returned successfully with soundscape details
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/mix", AuthMiddleware, GetUserMixes)

/**
 * @swagger
 * /api/soundscapes/mix/{id}:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get one saved soundscape mix for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Soundscape mix id
 *     responses:
 *       '200':
 *         description: Soundscape mix returned successfully with soundscape details
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Soundscape mix not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/mix/:id", AuthMiddleware, GetOneMix)

/**
 * @swagger
 * /api/soundscapes/mix/{id}:
 *   put:
 *     tags:
 *       - Soundscapes
 *     summary: Update the current authenticated user's soundscape mix
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Soundscape mix id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Morning focus mix
 *               soundscape_ids:
 *                 type: array
 *                 minItems: 2
 *                 maxItems: 6
 *                 items:
 *                   type: string
 *                   format: uuid
 *               volumes:
 *                 type: object
 *                 example:
 *                   00000000-0000-0000-0000-000000000000: 0.6
 *                   11111111-1111-4111-8111-111111111111: 0.7
 *     responses:
 *       '200':
 *         description: Soundscape mix updated successfully
 *       '400':
 *         description: Missing or invalid soundscape mix data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Soundscape mix not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.put("/soundscapes/mix/:id", AuthMiddleware, UpdateMix)

/**
 * @swagger
 * /api/soundscapes/mix/{id}:
 *   delete:
 *     tags:
 *       - Soundscapes
 *     summary: Delete the current authenticated user's soundscape mix
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Soundscape mix id
 *     responses:
 *       '200':
 *         description: Soundscape mix deleted successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Soundscape mix not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.delete("/soundscapes/mix/:id", AuthMiddleware, DeleteMix)

/**
 * @swagger
 * /api/soundscapes/mix/{id}/favorite:
 *   put:
 *     tags:
 *       - Soundscapes
 *     summary: Favorite or unfavorite a saved soundscape mix
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *             required:
 *               - is_favorite
 *             properties:
 *               is_favorite:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: Soundscape mix favorite updated successfully
 *       '400':
 *         description: Missing is_favorite
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Soundscape mix not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.put("/soundscapes/mix/:id/favorite", AuthMiddleware, ToggleMixFavorite)

/**
 * @swagger
 * /api/soundscapes/mix/{id}/play:
 *   patch:
 *     tags:
 *       - Soundscapes
 *     summary: Record that the user played a saved soundscape mix
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Soundscape mix play recorded successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Soundscape mix not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.patch("/soundscapes/mix/:id/play", AuthMiddleware, RecordMixPlay)

/**
 * @swagger
 * /api/soundscapes/{category}:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get soundscapes by category
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Soundscape category
 *     responses:
 *       '200':
 *         description: Soundscapes returned successfully
 *       '400':
 *         description: Missing category
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:category", GetSoundscapesByCategory)

/**
 * @swagger
 * /api/soundscapes/{id}/details:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get one soundscape
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Soundscape id
 *     responses:
 *       '200':
 *         description: Soundscape returned successfully
 *       '404':
 *         description: Soundscape not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:id/details", GetOneSoundscape)

export default SoundscapeRoutes
