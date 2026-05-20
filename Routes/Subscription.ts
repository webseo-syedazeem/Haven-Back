import express from "express"
import { CancelSubscription, CreateCheckout, GetSubscription, HandleWebhook } from "../Controller/Subscription.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const SubscriptionRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Subscription
 *     description: Stripe subscription routes
 */

/**
 * @swagger
 * /api/subscription/checkout:
 *   post:
 *     tags:
 *       - Subscription
 *     summary: Create a Stripe subscription checkout session
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [weekly, monthly, yearly]
 *                 example: monthly
 *             required:
 *               - plan
 *     responses:
 *       '200':
 *         description: Checkout session created successfully
 *       '400':
 *         description: Missing, invalid, or duplicate subscription
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.post("/subscription/checkout", AuthMiddleware, CreateCheckout)

/**
 * @swagger
 * /api/subscription/webhook:
 *   post:
 *     tags:
 *       - Subscription
 *     summary: Handle Stripe subscription webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       '200':
 *         description: Webhook received successfully
 *       '400':
 *         description: Invalid webhook signature or payload
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.post("/subscription/webhook", HandleWebhook)

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
 * /api/subscription/cancel:
 *   post:
 *     tags:
 *       - Subscription
 *     summary: Cancel current authenticated user's active subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Subscription canceled successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Active subscription not found
 *       '500':
 *         description: Server error
 */
SubscriptionRoutes.post("/subscription/cancel", AuthMiddleware, CancelSubscription)

export default SubscriptionRoutes
