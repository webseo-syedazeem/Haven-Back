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
 *     summary: Export all data Passage stores for the current user
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
 *                 description: >
 *                   Sound Preferences / Sounds to Avoid, upserted into
 *                   user_sound_preferences. Entirely separate from the onboarding fields
 *                   below and unaffected by them.
 *               mode:
 *                 type: string
 *                 enum: [sleep, relax, focus]
 *                 description: 'ALL MODES: same field as POST /api/onboarding''s mode.'
 *               mode_breakers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 'FOCUS/SLEEP ONLY: "What breaks your {mode}?" multi-select. Omit for Relax.'
 *               mode_areas:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 'FOCUS/SLEEP ONLY: "Where do you need it most?" multi-select. Omit for Relax.'
 *               target_minutes:
 *                 type: integer
 *                 minimum: 0
 *                 nullable: true
 *                 description: 'FOCUS/SLEEP ONLY: plain INTEGER minutes (45), never "45 min". Omit for Relax.'
 *               main_goal:
 *                 type: string
 *                 nullable: true
 *                 description: 'RELAX ONLY: "What''s your main goal right now?". Omit for Focus/Sleep.'
 *               relax_causes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 'RELAX ONLY: "What''s usually causing your stress?" multi-select. Omit for Focus/Sleep.'
 *               calming_moments:
 *                 type: string
 *                 nullable: true
 *                 description: 'RELAX ONLY: "When do you most need to feel calmer?". Omit for Focus/Sleep.'
 *           examples:
 *             focusGuest:
 *               summary: Guest who onboarded in Focus
 *               value:
 *                 favourites: [5688323a-2fd9-4a73-af65-29c211dc76e8]
 *                 mode: focus
 *                 mode_breakers: [Background noise]
 *                 mode_areas: [At a desk]
 *                 target_minutes: 45
 *             relaxGuest:
 *               summary: Guest who onboarded in Relax
 *               value:
 *                 favourites: [5688323a-2fd9-4a73-af65-29c211dc76e8]
 *                 mode: relax
 *                 main_goal: Manage daily stress
 *                 relax_causes: [Work, Overthinking]
 *                 calming_moments: In the evenings
 *     responses:
 *       '200':
 *         description: >
 *           Import summary returned successfully. Onboarding is applied only if the
 *           account has no user_onboarding row yet; otherwise onboarding_note explains
 *           it was left alone. When applied, all 7 fields sent are written and
 *           users.onboarding_completed flips to true.
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
 *                     favourites_added:
 *                       type: integer
 *                     favourites_skipped:
 *                       type: integer
 *                     playlists_created:
 *                       type: integer
 *                     playlist_items_skipped:
 *                       type: integer
 *                     preferences_applied:
 *                       type: boolean
 *                     preferences_note:
 *                       type: string
 *                     onboarding_applied:
 *                       type: boolean
 *                     onboarding_note:
 *                       type: string
 *       '400':
 *         description: Invalid request body
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AccountRoutes.post("/account/import-guest-data", AuthMiddleware, ImportGuestData)

export default AccountRoutes
