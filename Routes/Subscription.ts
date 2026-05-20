import express from "express"
import { GetSubscription, HandleWebhook, SyncSubscription } from "../Controller/Subscription.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const SubscriptionRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Subscription
 *     description: RevenueCat subscription routes
 */

/**
 * @swagger
 * /api/subscription:
 *   get:
 *     tags:
 *       - Subscription
 *     summary: Get current authenticated user's subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Subscription returned successfully
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
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.get("/subscription", AuthMiddleware, GetSubscription)

/**
 * @swagger
 * /api/subscription/webhook:
 *   post:
 *     tags:
 *       - Subscription
 *     summary: Handle RevenueCat subscription webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Webhook received successfully
 *       '401':
 *         description: Unauthorized webhook
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.post("/subscription/webhook", HandleWebhook)

/**
 * @swagger
 * /api/subscription/sync:
 *   post:
 *     tags:
 *       - Subscription
 *     summary: Sync current authenticated user's subscription from RevenueCat
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Subscription synced successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.post("/subscription/sync", AuthMiddleware, SyncSubscription)

export default SubscriptionRoutes
