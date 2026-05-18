import express from "express"
import { SaveMood, GetAllMoods, GetLatestMood, UpdateMood } from "../Controller/Mood.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const MoodRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Mood
 *     description: Mood tracking routes
 */

/**
 * @swagger
 * /api/mood:
 *   post:
 *     tags:
 *       - Mood
 *     summary: Save current authenticated user's mood
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood:
 *                 type: string
 *                 enum: [Calm, Tense, Anxious, Overwhelmed, Low, Energised]
 *                 example: Calm
 *             required:
 *               - mood
 *     responses:
 *       '200':
 *         description: Mood saved successfully
 *       '400':
 *         description: Missing or invalid mood data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
MoodRoutes.post("/mood", AuthMiddleware, SaveMood)

/**
 * @swagger
 * /api/mood:
 *   get:
 *     tags:
 *       - Mood
 *     summary: Get all moods for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Moods returned successfully
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
 *                     moods:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
MoodRoutes.get("/mood", AuthMiddleware, GetAllMoods)

/**
 * @swagger
 * /api/mood/latest:
 *   get:
 *     tags:
 *       - Mood
 *     summary: Get latest mood for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Latest mood returned successfully
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
 *                     mood:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
MoodRoutes.get("/mood/latest", AuthMiddleware, GetLatestMood)

/**
 * @swagger
 * /api/mood/{id}:
 *   put:
 *     tags:
 *       - Mood
 *     summary: Update current authenticated user's mood
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Mood record id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mood:
 *                 type: string
 *                 enum: [Calm, Tense, Anxious, Overwhelmed, Low, Energised]
 *                 example: Tense
 *             required:
 *               - mood
 *     responses:
 *       '200':
 *         description: Mood updated successfully
 *       '400':
 *         description: Missing or invalid mood data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Mood not found
 *       '500':
 *         description: Server error
 */
MoodRoutes.put("/mood/:id", AuthMiddleware, UpdateMood)

export default MoodRoutes
