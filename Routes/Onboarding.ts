import express from "express"
import { GetOnboarding, PostOnboarding } from "../Controller/Onboarding.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const OnboardingRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Onboarding
 *     description: First-run onboarding capture routes
 */

/**
 * @swagger
 * /api/onboarding:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save onboarding answers (goals, starting mode, situation, and sound preferences)
 *     description: >
 *       goals/starting_mode/situation are written to user_onboarding. Any preference
 *       fields present (environment, preferred_sounds, preferred_animals,
 *       preferred_instruments, excluded_sounds, detail_preference, typical_duration)
 *       are upserted into user_sound_preferences so recommendations use them immediately.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goals
 *               - starting_mode
 *             properties:
 *               goals:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 5
 *                 items:
 *                   type: string
 *               starting_mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *               situation:
 *                 type: string
 *                 nullable: true
 *               environment:
 *                 type: array
 *                 items:
 *                   type: string
 *               preferred_sounds:
 *                 type: array
 *                 items:
 *                   type: string
 *               preferred_animals:
 *                 type: array
 *                 items:
 *                   type: string
 *               preferred_instruments:
 *                 type: array
 *                 items:
 *                   type: string
 *               excluded_sounds:
 *                 type: array
 *                 items:
 *                   type: string
 *               detail_preference:
 *                 type: string
 *                 enum: [minimal, balanced, rich]
 *               typical_duration:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Onboarding saved successfully
 *       '400':
 *         description: Invalid onboarding data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
OnboardingRoutes.post("/onboarding", AuthMiddleware, PostOnboarding)

/**
 * @swagger
 * /api/onboarding:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get the authenticated user's saved onboarding answers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Onboarding returned successfully (null if never completed)
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
OnboardingRoutes.get("/onboarding", AuthMiddleware, GetOnboarding)

export default OnboardingRoutes
