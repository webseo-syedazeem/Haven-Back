import express from "express"
import { GetProgress } from "../Controller/Progress.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const ProgressRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Progress
 *     description: Progress insight routes
 */

/**
 * @swagger
 * /api/progress:
 *   get:
 *     tags:
 *       - Progress
 *     summary: Get progress insights for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Progress insights returned successfully
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
 *                     progress:
 *                       type: object
 *                       properties:
 *                         stress_vs_breathwork:
 *                           type: object
 *                           properties:
 *                             breathwork_days_avg_stress:
 *                               type: number
 *                             no_breathwork_days_avg_stress:
 *                               type: number
 *                             insight:
 *                               type: string
 *                         sleep_vs_stress:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sleep_quality:
 *                                 type: string
 *                               avg_stress:
 *                                 type: number
 *                         tasks_vs_stress:
 *                           type: object
 *                           properties:
 *                             high_completion_avg_stress:
 *                               type: number
 *                             low_completion_avg_stress:
 *                               type: number
 *                             insight:
 *                               type: string
 *                         mood_frequency:
 *                           type: object
 *                           additionalProperties:
 *                             type: number
 *                         breathing_usage:
 *                           type: object
 *                           additionalProperties:
 *                             type: number
 *                         soundscape_usage_count:
 *                           type: number
 *                         daily_ease_trend:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                                 format: date
 *                               daily_ease:
 *                                 type: number
 *                               stress_level:
 *                                 type: number
 *                         summary_insight:
 *                           type: string
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ProgressRoutes.get("/progress", AuthMiddleware, GetProgress)

export default ProgressRoutes
