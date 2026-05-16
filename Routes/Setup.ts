import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    SaveSetup,
    GetSetup,
    UpdateSetup,
} from "../Controller/Setup.ts"

const SetupRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Setup
 *     description: User onboarding setup routes
 */

/**
 * @swagger
 * /api/setup:
 *   post:
 *     tags:
 *       - Setup
 *     summary: Save or update user setup data
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
 *                 enum: [calm, tense, anxious, overwhelmed]
 *                 example: calm
 *               sleep_quality:
 *                 type: string
 *                 enum: [Restful, Light sleep, Watching often, Hard to fall asleep, Very tired]
 *                 example: Restful
 *               day_feel:
 *                 type: string
 *                 enum: [Busy mornings, Long workdays, Energy dips, Caring for others, Irregular routine, Evenings feel hardest]
 *                 example: Busy mornings
 *               goal:
 *                 type: string
 *                 enum: [Feel calmer first, Sleep better, Focus More, Build healthy habits, Stop spiraling, Recover after work]
 *                 example: Feel calmer first
 *               time_preference:
 *                 type: string
 *                 enum: [3 min, 5 min, 10 min, 15 min]
 *                 example: 5 min
 *               support_types:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [Breathwork, Soundscapes, Movements, Check-ins, Reflection]
 *                 example: [Breathwork, Reflection]
 *             required:
 *               - mood
 *               - sleep_quality
 *               - day_feel
 *               - goal
 *               - time_preference
 *               - support_types
 *     responses:
 *       '200':
 *         description: Setup saved successfully
 *       '400':
 *         description: Missing or invalid setup data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SetupRoutes.post("/setup", AuthMiddleware, SaveSetup)

/**
 * @swagger
 * /api/setup:
 *   put:
 *     tags:
 *       - Setup
 *     summary: Update current authenticated user's setup data
 *     description: Updates any provided setup fields and regenerates the calm plan from the merged setup data.
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
 *                 enum: [calm, tense, anxious, overwhelmed]
 *                 example: tense
 *               sleep_quality:
 *                 type: string
 *                 enum: [Restful, Light sleep, Watching often, Hard to fall asleep, Very tired]
 *                 example: Light sleep
 *               day_feel:
 *                 type: string
 *                 enum: [Busy mornings, Long workdays, Energy dips, Caring for others, Irregular routine, Evenings feel hardest]
 *                 example: Long workdays
 *               goal:
 *                 type: string
 *                 enum: [Feel calmer first, Sleep better, Focus More, Build healthy habits, Stop spiraling, Recover after work]
 *                 example: Focus More
 *               time_preference:
 *                 type: string
 *                 enum: [3 min, 5 min, 10 min, 15 min]
 *                 example: 10 min
 *               support_types:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [Breathwork, Soundscapes, Movements, Check-ins, Reflection]
 *                 example: [Breathwork, Soundscapes]
 *     responses:
 *       '200':
 *         description: Setup updated successfully
 *       '400':
 *         description: Missing or invalid setup data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Setup not found
 *       '500':
 *         description: Server error
 */
SetupRoutes.put("/setup", AuthMiddleware, UpdateSetup)

/**
 * @swagger
 * /api/setup:
 *   get:
 *     tags:
 *       - Setup
 *     summary: Get current authenticated user's setup data
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Setup returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SetupRoutes.get("/setup", AuthMiddleware, GetSetup)

export default SetupRoutes
