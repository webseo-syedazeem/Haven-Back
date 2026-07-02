// Halcyon - HealthConnect Integration
import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    deleteAllConnections,
    disconnectProvider,
    getConnectionStatus,
    saveConnection,
} from "../Controller/HealthConnect.ts"

const HealthConnectRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: HealthConnect
 *     description: Apple Health and Google Health Connect routes
 */

/**
 * @swagger
 * /api/health-connect/save:
 *   post:
 *     tags:
 *       - HealthConnect
 *     summary: Save or update current user's health provider connection
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [apple, google]
 *                 example: apple
 *               is_connected:
 *                 type: boolean
 *                 example: true
 *               permissions:
 *                 type: object
 *                 nullable: true
 *                 example:
 *                   requested: [Steps, SleepAnalysis, HeartRateVariability, RestingHeartRate]
 *                   connected_at: "2026-06-19T10:00:00.000Z"
 *             required:
 *               - provider
 *     responses:
 *       '200':
 *         description: Health connection saved successfully
 *       '400':
 *         description: Missing or invalid provider
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
HealthConnectRoutes.post("/health-connect/save", AuthMiddleware, saveConnection)

/**
 * @swagger
 * /api/health-connect/status/{userId}:
 *   get:
 *     tags:
 *       - HealthConnect
 *     summary: Get health connection status for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Authenticated user's Supabase auth id
 *     responses:
 *       '200':
 *         description: Health connection statuses returned successfully
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
 *                     connections:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           user_id:
 *                             type: string
 *                             format: uuid
 *                           provider:
 *                             type: string
 *                             enum: [apple, google]
 *                           is_connected:
 *                             type: boolean
 *                           permissions:
 *                             type: object
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *       '400':
 *         description: Missing user id
 *       '401':
 *         description: Invalid or missing session
 *       '403':
 *         description: Cannot access another user's health connections
 *       '500':
 *         description: Server error
 */
HealthConnectRoutes.get("/health-connect/status/:userId", AuthMiddleware, getConnectionStatus)

/**
 * @swagger
 * /api/health-connect/disconnect:
 *   delete:
 *     tags:
 *       - HealthConnect
 *     summary: Disconnect a health provider for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [apple, google]
 *                 example: google
 *             required:
 *               - provider
 *     responses:
 *       '200':
 *         description: Health provider disconnected successfully
 *       '400':
 *         description: Missing or invalid provider
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
HealthConnectRoutes.delete("/health-connect/disconnect", AuthMiddleware, disconnectProvider)
/**
 * @swagger
 * /api/health-connect/delete-all:
 *   delete:
 *     tags:
 *       - HealthConnect
 *     summary: Permanently delete all health connections for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: All health data deleted successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
HealthConnectRoutes.delete("/health-connect/delete-all", AuthMiddleware, deleteAllConnections)

export default HealthConnectRoutes
