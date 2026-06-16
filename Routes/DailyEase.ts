import express from "express"
import { GetDailyEase } from "../Controller/DailyEase.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const DailyEaseRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: DailyEase
 *     description: Daily Ease score routes
 */

/**
 * @swagger
 * /api/daily-ease:
 *   get:
 *     tags:
 *       - DailyEase
 *     summary: Get today's Daily Ease score for current authenticated user
 *     description: >
 *       Calculates Daily Ease by reading from all existing tables —
 *       breathing sessions, soundscape plays, checklist, mood check-ins,
 *       and the nightly check-in. No extra input needed from the frontend.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Daily Ease score returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     daily_ease:
 *                       type: object
 *                       properties:
 *                         score:
 *                           type: integer
 *                           example: 72
 *                         label:
 *                           type: string
 *                           example: Supported
 *                     stress_today:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         score:
 *                           type: integer
 *                           example: 7
 *                         label:
 *                           type: string
 *                           example: High
 *                     insight:
 *                       type: string
 *                       example: You did the right things today.
 *                     breakdown:
 *                       type: object
 *                       properties:
 *                         breathwork:
 *                           type: object
 *                           properties:
 *                             score:
 *                               type: integer
 *                             app_tracked:
 *                               type: boolean
 *                         soundscape:
 *                           type: object
 *                           properties:
 *                             score:
 *                               type: integer
 *                             app_tracked:
 *                               type: boolean
 *                         tasks:
 *                           type: object
 *                           properties:
 *                             score:
 *                               type: integer
 *                             completed:
 *                               type: array
 *                               items:
 *                                 type: string
 *                         mood:
 *                           type: object
 *                           properties:
 *                             score:
 *                               type: integer
 *                             checkins_today:
 *                               type: integer
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2026-06-15"
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
DailyEaseRoutes.get("/daily-ease", AuthMiddleware, GetDailyEase)

export default DailyEaseRoutes