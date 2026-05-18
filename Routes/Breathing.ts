import express from "express"
import { StartSession, UpdateSession, GetAllSessions, GetOneSession } from "../Controller/Breathing.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const BreathingRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Breathing
 *     description: Breathing session routes
 */

/**
 * @swagger
 * /api/breathing:
 *   post:
 *     tags:
 *       - Breathing
 *     summary: Start current authenticated user's breathing session
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [Box Breathing, 4-7-8 Sleep Reset, Physiological Sigh, Resonant Breathing, Focus Reset, Morning Lift]
 *                 example: Box Breathing
 *             required:
 *               - type
 *     responses:
 *       '200':
 *         description: Breathing session started successfully
 *       '400':
 *         description: Missing or invalid breathing session data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
BreathingRoutes.post("/breathing", AuthMiddleware, StartSession)

/**
 * @swagger
 * /api/breathing/{id}:
 *   put:
 *     tags:
 *       - Breathing
 *     summary: Update current authenticated user's breathing session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Breathing session id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completed_duration_seconds:
 *                 type: number
 *                 example: 16
 *             required:
 *               - completed_duration_seconds
 *     responses:
 *       '200':
 *         description: Breathing session updated successfully
 *       '400':
 *         description: Missing or invalid breathing session data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Breathing session not found
 *       '500':
 *         description: Server error
 */
BreathingRoutes.put("/breathing/:id", AuthMiddleware, UpdateSession)

/**
 * @swagger
 * /api/breathing:
 *   get:
 *     tags:
 *       - Breathing
 *     summary: Get all breathing sessions for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Breathing sessions returned successfully
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
 *                     sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
BreathingRoutes.get("/breathing", AuthMiddleware, GetAllSessions)

/**
 * @swagger
 * /api/breathing/{id}:
 *   get:
 *     tags:
 *       - Breathing
 *     summary: Get one breathing session for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Breathing session id
 *     responses:
 *       '200':
 *         description: Breathing session returned successfully with breathing type details
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
 *                     session:
 *                       type: object
 *                       properties:
 *                         inhale:
 *                           type: integer
 *                         hold1:
 *                           type: integer
 *                         exhale:
 *                           type: integer
 *                         hold2:
 *                           type: integer
 *                         total_duration_seconds:
 *                           type: integer
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Breathing session not found
 *       '500':
 *         description: Server error
 */
BreathingRoutes.get("/breathing/:id", AuthMiddleware, GetOneSession)

export default BreathingRoutes
