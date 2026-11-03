import express from "express"
import {
    ContactSupport,
    GetMySupportRequests,
    ReportAudioProblem,
    RequestSoundscape,
} from "../Controller/Support.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const SupportRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Support
 *     description: Authenticated support request routes
 */

/**
 * @swagger
 * /api/support/contact:
 *   post:
 *     tags:
 *       - Support
 *     summary: Contact Passage support
 *     description: Requires a valid bearer token. contact_email is optional.
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
SupportRoutes.post("/support/contact", AuthMiddleware, ContactSupport)

/**
 * @swagger
 * /api/support/report-audio-problem:
 *   post:
 *     tags:
 *       - Support
 *     summary: Report a problem with a soundscape's audio
 *     description: Requires a valid bearer token. contact_email is optional.
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
 *               reason:
 *                 type: string
 *                 nullable: true
 *                 description: >
 *                   Optional structured reason for the report, stored in its own
 *                   column (e.g. "Audio cuts out", "Wrong sounds", "Poor quality",
 *                   "Won't play"). Independent of message, which is unchanged.
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
SupportRoutes.post("/support/report-audio-problem", AuthMiddleware, ReportAudioProblem)

/**
 * @swagger
 * /api/support/request-soundscape:
 *   post:
 *     tags:
 *       - Support
 *     summary: Request a new soundscape
 *     description: Requires a valid bearer token. contact_email is optional.
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
SupportRoutes.post("/support/request-soundscape", AuthMiddleware, RequestSoundscape)

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
