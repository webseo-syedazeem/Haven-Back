import express from "express"
import { SaveTrack, UpdateTrack, GetAllTracks, GetTodayTrack } from "../Controller/Track.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const TrackRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Track
 *     description: Daily track routes
 */

/**
 * @swagger
 * /api/track:
 *   post:
 *     tags:
 *       - Track
 *     summary: Save today's track for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sleep_quality:
 *                 type: string
 *                 enum: [Restful, Light Sleep, Waking Often, Hard to Fall Asleep, Very Tired]
 *                 example: Restful
 *               notes:
 *                 type: string
 *                 example: Slept earlier and felt calmer.
 *               glimmers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [Morning sunlight, Quiet walk]
 *     responses:
 *       '200':
 *         description: Track saved successfully
 *       '400':
 *         description: Track already saved or invalid track data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
TrackRoutes.post("/track", AuthMiddleware, SaveTrack)

/**
 * @swagger
 * /api/track:
 *   get:
 *     tags:
 *       - Track
 *     summary: Get all tracks for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Tracks returned successfully
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
 *                     tracks:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
TrackRoutes.get("/track", AuthMiddleware, GetAllTracks)

/**
 * @swagger
 * /api/track/today:
 *   get:
 *     tags:
 *       - Track
 *     summary: Get today's track for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Today's track returned successfully
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
 *                     track:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
TrackRoutes.get("/track/today", AuthMiddleware, GetTodayTrack)

/**
 * @swagger
 * /api/track/{id}:
 *   put:
 *     tags:
 *       - Track
 *     summary: Update current authenticated user's track
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Track id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sleep_quality:
 *                 type: string
 *                 enum: [Restful, Light Sleep, Waking Often, Hard to Fall Asleep, Very Tired]
 *                 example: Light Sleep
 *               notes:
 *                 type: string
 *                 example: Woke up once but settled again.
 *               glimmers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [Tea break, Finished work early]
 *     responses:
 *       '200':
 *         description: Track updated successfully
 *       '400':
 *         description: Inactive track or invalid track data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Track not found
 *       '500':
 *         description: Server error
 */
TrackRoutes.put("/track/:id", AuthMiddleware, UpdateTrack)

export default TrackRoutes
