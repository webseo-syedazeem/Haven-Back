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
 *       Authentication is optional. If the user has a stored onboarding `mode`, that mode
 *       is a HARD filter — only that mode's soundscapes are considered — refined by soft
 *       signals from user_onboarding (mode_breakers and mode_areas and target_minutes for
 *       Focus/Sleep; relax_causes and calming_moments for Relax) and from
 *       user_sound_preferences (preferred sounds/animals/instruments, detail_preference,
 *       intensity_preference, typical_duration as a duration fallback).
 *       excluded_sounds is always a hard exclusion. user_goals and main_goal are stored
 *       but deliberately NOT used in ranking — see API_CONTRACT_ONBOARDING_GOALS.md.
 *       Guests and signed-in users with no stored mode fall back to the prior generic
 *       behaviour: mixed-mode, most-played/popular for users with no preferences at all.
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
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [sleep, relax, focus]
 *         description: >
 *           Optional one-request preview override for the goal/mode filter. Does not
 *           change the user's stored mode. `goal` is accepted as an alias.
 *       - in: query
 *         name: goal
 *         schema:
 *           type: string
 *           enum: [sleep, relax, focus]
 *         description: Alias for `mode`.
 *     responses:
 *       '200':
 *         description: Recommendations returned successfully
 *       '400':
 *         description: Invalid count or mode/goal parameter
 *       '500':
 *         description: Server error
 */
RecommendationsRoutes.get("/recommendations", OptionalAuthMiddleware, GetRecommendations)

export default RecommendationsRoutes
