import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import { AdminAuthMiddleware } from "../Middleware/AdminAuthMiddleware.ts"
import {
    GetNotificationPreferences,
    RegisterDevice,
    SendNewCollectionAlert,
    UnregisterDevice,
    UpdateNotificationPreferences,
} from "../Controller/Notifications.ts"

const NotificationsRoutes = express.Router()
const requireAdmin = [AuthMiddleware, AdminAuthMiddleware] as const

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: Authenticated notification preference routes
 */

/**
 * @swagger
 * /api/preferences/notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get the current user's notification settings
 *     description: >
 *       Returns data.settings with reminders_enabled, new_collection_alerts and
 *       reminder_time (null when the user has not chosen one).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Notification settings returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.get("/preferences/notifications", AuthMiddleware, GetNotificationPreferences)

/**
 * @swagger
 * /api/preferences/notifications:
 *   put:
 *     tags:
 *       - Notifications
 *     summary: Partially update the current user's notification settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reminders_enabled:
 *                 type: boolean
 *               new_collection_alerts:
 *                 type: boolean
 *               reminder_time:
 *                 type: string
 *                 nullable: true
 *                 description: >
 *                   Optional 24-hour "HH:MM" (or "HH:MM:SS") wall-clock time for the
 *                   wind-down reminder, stored so the choice follows the user across
 *                   devices. Omit to leave the stored value untouched; send null to
 *                   clear it. The reminder itself is scheduled on the device — the
 *                   server does not send it.
 *                 example: "21:30"
 *     responses:
 *       '200':
 *         description: Notification settings updated successfully
 *       '400':
 *         description: Invalid setting value
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.put("/preferences/notifications", AuthMiddleware, UpdateNotificationPreferences)

/**
 * @swagger
 * /api/notifications/register-device:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Register (or refresh) a push notification device token for the current user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform]
 *             properties:
 *               token:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [ios, android, web]
 *     responses:
 *       '200':
 *         description: Device registered successfully
 *       '400':
 *         description: Invalid token or platform
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.post("/notifications/register-device", AuthMiddleware, RegisterDevice)

/**
 * @swagger
 * /api/notifications/device/{token}:
 *   delete:
 *     tags:
 *       - Notifications
 *     summary: Unregister a push notification device token for the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Device unregistered successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.delete("/notifications/device/:token", AuthMiddleware, UnregisterDevice)

/**
 * @swagger
 * /api/admin/notifications/new-collection-alert:
 *   post:
 *     tags:
 *       - Notifications
 *     summary: Notify users who opted into new-collection alerts and have registered devices
 *     description: >
 *       Writes a notifications_log row per eligible user and sends valid Expo push
 *       tokens through Expo Push Service, which routes them to APNs or FCM.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [collection_id, title, body]
 *             properties:
 *               collection_id:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Alert processed successfully
 *       '400':
 *         description: Invalid input or unknown collection
 *       '401':
 *         description: Invalid or missing session
 *       '403':
 *         description: Admin access required
 *       '500':
 *         description: Server error
 */
NotificationsRoutes.post(
    "/admin/notifications/new-collection-alert",
    ...requireAdmin,
    SendNewCollectionAlert
)

export default NotificationsRoutes
