import express from "express"
import { GetRecommendations } from "../Controller/Recommendations.ts"
import { OptionalAuthMiddleware } from "../Middleware/OptionalAuthMiddleware.ts"

const RecommendationsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Recommendations
 *     description: Preference-scored soundscape recommendations
 */

/**
 * @swagger
 * /api/recommendations:
 *   get:
 *     tags:
 *       - Recommendations
 *     summary: Get one best-match soundscape plus alternatives (O21)
 *     description: >
 *       Authentication is optional. Signed-in users are scored against their sound
 *       preferences and onboarding answers, with hard exclusions for excluded sounds.
 *       Guests and users with no preferences fall back to most-played/popular soundscapes.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 20
 *           default: 4
 *         description: Number of alternatives to return
 *     responses:
 *       '200':
 *         description: Recommendations returned successfully
 *       '400':
 *         description: Invalid count parameter
 *       '500':
 *         description: Server error
 */
RecommendationsRoutes.get("/recommendations", OptionalAuthMiddleware, GetRecommendations)

export default RecommendationsRoutes
