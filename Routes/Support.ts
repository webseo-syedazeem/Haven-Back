import express from "express"
import {
    ContactSupport,
    GetMySupportRequests,
    ReportAudioProblem,
    RequestSoundscape,
} from "../Controller/Support.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import { OptionalAuthMiddleware } from "../Middleware/OptionalAuthMiddleware.ts"

const SupportRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Support
 *     description: Guest and authenticated support request routes
 */

/**
 * @swagger
 * /api/support/contact:
 *   post:
 *     tags:
 *       - Support
 *     summary: Contact Halcyon support
 *     description: Authentication is optional. Guest submissions must provide contact_email.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       '201':
 *         description: Support request submitted successfully
 *       '400':
 *         description: Invalid submission
 *       '500':
 *         description: Server error
 */
SupportRoutes.post("/support/contact", OptionalAuthMiddleware, ContactSupport)

/**
 * @swagger
 * /api/support/report-audio-problem:
 *   post:
 *     tags:
 *       - Support
 *     summary: Report a problem with a soundscape's audio
 *     description: Authentication is optional. Guest submissions must provide contact_email.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - soundscape_id
 *             properties:
 *               soundscape_id:
 *                 type: string
 *                 format: uuid
 *               message:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       '201':
 *         description: Audio problem report submitted successfully
 *       '400':
 *         description: Invalid submission or soundscape
 *       '500':
 *         description: Server error
 */
SupportRoutes.post("/support/report-audio-problem", OptionalAuthMiddleware, ReportAudioProblem)

/**
 * @swagger
 * /api/support/request-soundscape:
 *   post:
 *     tags:
 *       - Support
 *     summary: Request a new soundscape
 *     description: Authentication is optional. Guest submissions must provide contact_email.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               contact_email:
 *                 type: string
 *                 format: email
 *     responses:
 *       '201':
 *         description: Soundscape request submitted successfully
 *       '400':
 *         description: Invalid submission
 *       '500':
 *         description: Server error
 */
SupportRoutes.post("/support/request-soundscape", OptionalAuthMiddleware, RequestSoundscape)

/**
 * @swagger
 * /api/support/my-requests:
 *   get:
 *     tags:
 *       - Support
 *     summary: Get the authenticated user's support requests
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Support requests returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
SupportRoutes.get("/support/my-requests", AuthMiddleware, GetMySupportRequests)

export default SupportRoutes
