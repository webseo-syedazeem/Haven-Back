import express from "express"
import { SaveCheckin, UpdateCheckin, GetCheckins } from "../Controller/Checkin.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const CheckinRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Checkin
 *     description: Daily check-in routes
 */

/**
 * @swagger
 * /api/checkin:
 *   post:
 *     tags:
 *       - Checkin
 *     summary: Save daily check-in
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stress_level:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 10
 *                 example: 6
 *               stress_factors:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [Work/study, Overthinking, Poor sleep, Social stress, Finances, Health]
 *                 example: [Work/study, Overthinking]
 *               helpful_today:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [Breathwork, Movements, Soundscape, meditation, Journaling, Rest]
 *                 example: [Breathwork, Rest]
 *               reflection:
 *                 type: string
 *                 example: I felt better after taking a short break.
 *             required:
 *               - stress_level
 *               - stress_factors
 *               - helpful_today
 *     responses:
 *       '200':
 *         description: Daily check-in saved successfully
 *       '400':
 *         description: Missing or invalid check-in data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
CheckinRoutes.post("/checkin", AuthMiddleware, SaveCheckin)
CheckinRoutes.put("/checkin", AuthMiddleware, UpdateCheckin)

/**
 * @swagger
 * /api/checkin:
 *   get:
 *     tags:
 *       - Checkin
 *     summary: Get all check-ins for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Check-ins returned successfully
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
 *                     checkins:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
CheckinRoutes.get("/checkin", AuthMiddleware, GetCheckins)

export default CheckinRoutes
