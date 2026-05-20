import express from "express"
import { SaveNotifications, UpdateNotifications, GetNotifications } from "../Controller/Notifications.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const NotificationsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: User notification settings routes
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     NotificationsBody:
 *       type: object
 *       properties:
 *         morning_reminder:
 *           type: boolean
 *           example: true
 *         morning_reminder_time:
 *           type: string
 *           example: "08:00"
 *         mood_checkin:
 *           type: boolean
 *           example: true
 *         mood_checkin_time:
 *           type: string
 *           example: "12:00"
 *         checklist_reminder:
 *           type: boolean
 *           example: true
 *         checklist_reminder_time:
 *           type: string
 *           example: "16:00"
 *         evening_wind_down:
 *           type: boolean
 *           example: true
 *         evening_wind_down_time:
 *           type: string
 *           example: "21:00"
 *         soundscape_reminder:
 *           type: boolean
 *           example: false
 *         soundscape_reminder_time:
 *           type: string
 *           example: "22:00"
 */

/**
 * @swagger
 * /api/notifications:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Save current authenticated user's notification settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NotificationsBody'
 *     responses:
 *       '200':
 *         description: Notifications saved successfully
 *       '400':
 *         description: Notifications already saved
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.post("/notifications", AuthMiddleware, SaveNotifications)

/**
 * @swagger
 * /api/notifications:
 *   put:
 *     tags:
 *       - Notifications
 *     summary: Update current authenticated user's notification settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NotificationsBody'
 *     responses:
 *       '200':
 *         description: Notifications updated successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Notifications not found
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.put("/notifications", AuthMiddleware, UpdateNotifications)

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get current authenticated user's notification settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Notifications returned successfully
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
 *                     notifications:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.get("/notifications", AuthMiddleware, GetNotifications)

export default NotificationsRoutes
