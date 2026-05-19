import express from "express"
import { GetAllSoundscapes, GetSoundscapesByPillar, GetOneSoundscape, SaveMix, GetUserMixes, GetOneMix, UpdateMix, DeleteMix } from "../Controller/Soundscape.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

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
 *     summary: Get all soundscapes grouped by pillar
 *     responses:
 *       '200':
 *         description: Soundscapes returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     calm:
 *                       type: array
 *                       items:
 *                         type: object
 *                     sleep:
 *                       type: array
 *                       items:
 *                         type: object
 *                     focus:
 *                       type: array
 *                       items:
 *                         type: object
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes", GetAllSoundscapes)

/**
 * @swagger
 * /api/soundscapes/mix:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get saved soundscape mixes for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Soundscape mixes returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     mixes:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/mix", AuthMiddleware, GetUserMixes)

/**
 * @swagger
 * /api/soundscapes/mix:
 *   post:
 *     tags:
 *       - Soundscapes
 *     summary: Save a soundscape mix for current authenticated user
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
 *                 example: 00000000-0000-0000-0000-000000000000
 *               mix_name:
 *                 type: string
 *                 example: Evening calm mix
 *               layer_settings_json:
 *                 type: object
 *                 example:
 *                   rain: 0.7
 *                   wind: 0.25
 *               timer_default:
 *                 type: integer
 *                 example: 1800
 *             required:
 *               - soundscape_id
 *               - mix_name
 *               - layer_settings_json
 *               - timer_default
 *     responses:
 *       '200':
 *         description: Soundscape mix saved successfully
 *       '400':
 *         description: Missing or invalid soundscape mix data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.post("/soundscapes/mix", AuthMiddleware, SaveMix)

/**
 * @swagger
 * /api/soundscapes/mix/{id}:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get one saved soundscape mix for current authenticated user
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
 *         description: Soundscape mix returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     mix:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         user_id:
 *                           type: string
 *                           format: uuid
 *                         soundscape_id:
 *                           type: string
 *                           format: uuid
 *                         mix_name:
 *                           type: string
 *                         layer_settings_json:
 *                           type: object
 *                         timer_default:
 *                           type: integer
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
 *     summary: Update current authenticated user's soundscape mix
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
 *               mix_name:
 *                 type: string
 *                 example: Morning focus mix
 *               layer_settings_json:
 *                 type: object
 *                 example:
 *                   rain: 0.4
 *                   birds: 0.8
 *               timer_default:
 *                 type: integer
 *                 example: 1200
 *     responses:
 *       '200':
 *         description: Soundscape mix updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     mix:
 *                       type: object
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
 *     summary: Delete current authenticated user's soundscape mix
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
 * /api/soundscapes/{pillar}:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get soundscapes by pillar
 *     parameters:
 *       - in: path
 *         name: pillar
 *         required: true
 *         schema:
 *           type: string
 *           enum: [calm, sleep, focus]
 *         description: Soundscape pillar
 *     responses:
 *       '200':
 *         description: Soundscapes returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     soundscapes:
 *                       type: array
 *                       items:
 *                         type: object
 *       '400':
 *         description: Invalid pillar
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:pillar", GetSoundscapesByPillar)

/**
 * @swagger
 * /api/soundscapes/{id}/details:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get one soundscape with layers
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
 *         description: Soundscape returned successfully with layers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     soundscape:
 *                       type: object
 *                     layers:
 *                       type: array
 *                       items:
 *                         type: object
 *       '404':
 *         description: Soundscape not found
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:id/details", GetOneSoundscape)

export default SoundscapeRoutes
