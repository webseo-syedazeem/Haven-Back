import express from "express"
import { ExportAccountData } from "../Controller/Account.ts"
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
 *     tags: [Account]
 *     summary: Export all data Passage stores for the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200': { description: Account data exported successfully }
 *       '401': { description: Invalid or missing session }
 *       '500': { description: Server error }
 */
AccountRoutes.get("/account/export", AuthMiddleware, ExportAccountData)

export default AccountRoutes
