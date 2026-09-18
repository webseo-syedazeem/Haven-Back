import express from "express"
import { GetOnboarding, PatchOnboarding, PostOnboarding } from "../Controller/Onboarding.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const OnboardingRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Onboarding
 *     description: First-run onboarding capture routes
 * components:
 *   schemas:
 *     OnboardingAnswers:
 *       type: object
 *       description: >
 *         The 8 fields of public.user_onboarding. `mode` is the only required one.
 *         Each mode sends only its own family and omits the rest, which stay at their
 *         DB defaults ('{}' for the arrays, null for the others):
 *         ALL MODES mode, user_goals. FOCUS/SLEEP mode_breakers, mode_areas,
 *         target_minutes. RELAX main_goal, relax_causes, calming_moments.
 *         See API_CONTRACT_ONBOARDING_GOALS.md for the full per-mode option lists.
 *       required:
 *         - mode
 *       properties:
 *         mode:
 *           type: string
 *           enum: [sleep, relax, focus]
 *           description: 'ALL MODES: "What would you like help with?". The only required field.'
 *         user_goals:
 *           type: string
 *           nullable: true
 *           description: >
 *             ALL MODES: "Choose a goal" — a single value. Same screen shape in every
 *             flow, with mode-specific options (Focus deeply / Feel calmer / Sleep
 *             easier / Work easier / ...).
 *         mode_breakers:
 *           type: array
 *           items:
 *             type: string
 *           description: >
 *             FOCUS/SLEEP ONLY: "What breaks your {mode}?" — multi-select. Omit for
 *             Relax; it stays '{}'.
 *         mode_areas:
 *           type: array
 *           items:
 *             type: string
 *           description: >
 *             FOCUS/SLEEP ONLY: "Where do you need it most?" — multi-select. Omit for
 *             Relax; it stays '{}'.
 *         target_minutes:
 *           type: integer
 *           minimum: 0
 *           nullable: true
 *           description: >
 *             FOCUS/SLEEP ONLY: "How long do you usually {mode} for?" — a plain INTEGER
 *             number of minutes (45), never a display string ("45 min"). Omit for Relax;
 *             it stays null.
 *         main_goal:
 *           type: string
 *           nullable: true
 *           description: >
 *             RELAX ONLY: "What's your main goal right now?" (Feel less anxious / Manage
 *             daily stress / Be more present / Sleep more easily / Just explore). Omit
 *             for Focus/Sleep; it stays null.
 *         relax_causes:
 *           type: array
 *           items:
 *             type: string
 *           description: >
 *             RELAX ONLY: "What's usually causing your stress?" — multi-select (Work /
 *             Overthinking / Social situations / News and social media / Finances /
 *             Other). Omit for Focus/Sleep; it stays '{}'.
 *         calming_moments:
 *           type: string
 *           nullable: true
 *           description: >
 *             RELAX ONLY: "When do you most need to feel calmer?" (During the day / In
 *             the evenings / At night / Throughout the day). Omit for Focus/Sleep; it
 *             stays null.
 *     OnboardingRow:
 *       type: object
 *       description: >
 *         A stored public.user_onboarding row — the same 8 data fields as
 *         OnboardingAnswers, plus bookkeeping. Request and response use identical names.
 *       properties:
 *         user_id:
 *           type: integer
 *           format: int64
 *         mode:
 *           type: string
 *           enum: [sleep, relax, focus]
 *           nullable: true
 *         user_goals:
 *           type: string
 *           nullable: true
 *         mode_breakers:
 *           type: array
 *           items:
 *             type: string
 *         mode_areas:
 *           type: array
 *           items:
 *             type: string
 *         target_minutes:
 *           type: integer
 *           nullable: true
 *           description: Plain integer minutes, never a display string.
 *         main_goal:
 *           type: string
 *           nullable: true
 *         relax_causes:
 *           type: array
 *           items:
 *             type: string
 *         calming_moments:
 *           type: string
 *           nullable: true
 *         completed:
 *           type: boolean
 *         completed_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/onboarding:
 *   post:
 *     tags:
 *       - Onboarding
 *     summary: Save the user's onboarding answers for their chosen mode
 *     description: >
 *       Accepts the 8 fields of public.user_onboarding; only `mode` is required.
 *       Send just the fields that belong to the mode the user is in — omitted fields
 *       stay at their DB defaults and are NOT validated for absence, so no request is
 *       rejected for "wrong mode" fields. Every submission is a FULL OVERWRITE of all
 *       8 columns, so a resubmit must resend everything relevant. Also sets
 *       users.onboarding_completed = true.
 *       Sound-catalogue preferences (preferred sounds/animals/instruments/environments,
 *       excluded sounds, detail level) are NOT part of onboarding and are not accepted
 *       here — PUT /api/preferences/sound owns those, and this endpoint never writes to
 *       user_sound_preferences.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingAnswers'
 *           examples:
 *             focus:
 *               summary: Focus submission (mode_breakers / mode_areas / target_minutes)
 *               value:
 *                 mode: focus
 *                 user_goals: Focus deeply
 *                 mode_breakers: [Background noise, Phone distractions]
 *                 mode_areas: [At a desk, Studying]
 *                 target_minutes: 45
 *             sleep:
 *               summary: Sleep submission (same three Focus/Sleep fields)
 *               value:
 *                 mode: sleep
 *                 user_goals: Sleep easier
 *                 mode_breakers: [Racing thoughts, Outside noise]
 *                 mode_areas: [Falling asleep]
 *                 target_minutes: 90
 *             relax:
 *               summary: Relax submission (main_goal / relax_causes / calming_moments)
 *               value:
 *                 mode: relax
 *                 user_goals: Feel calmer
 *                 main_goal: Manage daily stress
 *                 relax_causes: [Work, Overthinking]
 *                 calming_moments: In the evenings
 *     responses:
 *       '200':
 *         description: Onboarding saved successfully
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
 *                     onboarding:
 *                       $ref: '#/components/schemas/OnboardingRow'
 *                     preferences:
 *                       type: object
 *                       description: >
 *                         The user's existing user_sound_preferences row, returned
 *                         unchanged. This endpoint never writes to it.
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
 *   patch:
 *     tags:
 *       - Onboarding
 *     summary: Switch the authenticated user's mode without resubmitting the rest of onboarding
 *     description: >
 *       Requires the user to have already completed onboarding via POST /api/onboarding.
 *       Updates only `mode`; the other 7 answers are left exactly as stored, including
 *       the previous mode's family — use POST /api/onboarding to replace those.
 *       Invalidates the user's recommendations, home-recommended, and continue-listening
 *       caches.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *                 description: Same field name POST /api/onboarding uses.
 *     responses:
 *       '200':
 *         description: Mode switched successfully
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
 *                     onboarding:
 *                       $ref: '#/components/schemas/OnboardingRow'
 *       '400':
 *         description: Invalid mode, or onboarding was never completed
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
OnboardingRoutes.patch("/onboarding", AuthMiddleware, PatchOnboarding)

/**
 * @swagger
 * /api/onboarding:
 *   get:
 *     tags:
 *       - Onboarding
 *     summary: Get the authenticated user's saved onboarding answers
 *     description: >
 *       Returns the stored row with the same field names POST accepts — all 8 data
 *       fields plus bookkeeping. Fields the user's mode does not collect read back as
 *       '[]' (mode_breakers, mode_areas, relax_causes) or null (the rest).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Onboarding returned successfully (null if never completed)
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
 *                     onboarding:
 *                       nullable: true
 *                       allOf:
 *                         - $ref: '#/components/schemas/OnboardingRow'
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
OnboardingRoutes.get("/onboarding", AuthMiddleware, GetOnboarding)

export default OnboardingRoutes
