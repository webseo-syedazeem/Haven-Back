import express from "express"
import { GetContinueListening } from "../Controller/Home.ts"
import { GetRecommendedNow } from "../Controller/Recommendations.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import { OptionalAuthMiddleware } from "../Middleware/OptionalAuthMiddleware.ts"

const HomeRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Home
 *     description: Home screen aggregation routes
 */

/**
 * @swagger
 * /api/home/continue-listening:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get the authenticated user's in-progress soundscapes, most recent first
 *     description: Excludes completed plays and soundscapes that are no longer live. De-duplicated by soundscape.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Continue listening items returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
HomeRoutes.get("/home/continue-listening", AuthMiddleware, GetContinueListening)

/**
 * @swagger
 * /api/home/recommended:
 *   get:
 *     tags:
 *       - Home
 *     summary: Get the top "Recommended Now" live soundscapes for the Home screen
 *     description: Authentication is optional. Uses the same scoring as /api/recommendations.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     responses:
 *       '200':
 *         description: Recommended soundscapes returned successfully
 *       '500':
 *         description: Server error
 */
HomeRoutes.get("/home/recommended", OptionalAuthMiddleware, GetRecommendedNow)

export default HomeRoutes
