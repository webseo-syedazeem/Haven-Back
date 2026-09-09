import express from "express"
import { LogAnalyticsEvents } from "../Controller/Analytics.ts"
import { OptionalAuthMiddleware } from "../Middleware/OptionalAuthMiddleware.ts"

const AnalyticsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Client-driven analytics event logging
 */

/**
 * @swagger
 * /api/analytics/events:
 *   post:
 *     tags: [Analytics]
 *     summary: Log one or more analytics events
 *     description: >
 *       Authentication is optional. Guests may send session_id to group events.
 *       Accepts a single event ({ event_name, event_data?, session_id? }) or a batch
 *       ({ events: [...] }). Clients fire these events; other API controllers do not.
 *       Consent is enforced for authenticated callers: when the user's
 *       users.analytics_enabled is false (the default), events are discarded and the
 *       response is a 200 with logged: 0 and reason: "analytics_disabled". Anonymous
 *       events have no consent record and are accepted as before.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [event_name]
 *                 properties:
 *                   event_name: { type: string }
 *                   event_data: { type: object }
 *                   session_id: { type: string }
 *               - type: object
 *                 required: [events]
 *                 properties:
 *                   events:
 *                     type: array
 *                     minItems: 1
 *                     items:
 *                       type: object
 *                       required: [event_name]
 *                       properties:
 *                         event_name: { type: string }
 *                         event_data: { type: object }
 *                         session_id: { type: string }
 *     responses:
 *       '200':
 *         description: Events logged
 *       '400':
 *         description: Missing event_name or events array
 *       '500':
 *         description: Server error
 */
AnalyticsRoutes.post("/analytics/events", OptionalAuthMiddleware, LogAnalyticsEvents)

export default AnalyticsRoutes
