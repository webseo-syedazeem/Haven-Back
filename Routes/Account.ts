import express from "express"
import { ExportAccountData, ImportGuestData } from "../Controller/Account.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const AccountRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Account
 *     description: Authenticated account data routes
 */

/**
 * @swagger
 * /api/account/export:
 *   get:
 *     tags:
 *       - Account
 *     summary: Export all data Halcyon stores for the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Account data exported successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AccountRoutes.get("/account/export", AuthMiddleware, ExportAccountData)

/**
 * @swagger
 * /api/account/import-guest-data:
 *   post:
 *     tags:
 *       - Account
 *     summary: Best-effort batch import of a guest's locally-stored data after signup
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               favourites:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               playlists:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     cover_image_url:
 *                       type: string
 *                       nullable: true
 *                     soundscape_ids:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uuid
 *               sound_preferences:
 *                 type: object
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *               starting_mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *               situation:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Import summary returned successfully
 *       '400':
 *         description: Invalid request body
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AccountRoutes.post("/account/import-guest-data", AuthMiddleware, ImportGuestData)

export default AccountRoutes
