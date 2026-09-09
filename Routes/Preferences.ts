import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    GetDownloadPreferences,
    GetPlaybackPreferences,
    GetPrivacyPreferences,
    GetSoundPreferences,
    UpdateDownloadPreferences,
    UpdatePlaybackPreferences,
    UpdatePrivacyPreferences,
    UpdateSoundPreferences,
} from "../Controller/Preferences.ts"

const PreferencesRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Preferences
 *     description: Authenticated user preference routes
 */

/**
 * @swagger
 * /api/preferences/sound:
 *   get:
 *     tags:
 *       - Preferences
 *     summary: Get the current user's sound preferences
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Sound preferences returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.get("/preferences/sound", AuthMiddleware, GetSoundPreferences)

/**
 * @swagger
 * /api/preferences/sound:
 *   put:
 *     tags:
 *       - Preferences
 *     summary: Partially update the current user's sound preferences
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferred_environments:
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
 *               intensity_preference:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *     responses:
 *       '200':
 *         description: Sound preferences updated successfully
 *       '400':
 *         description: Invalid preference value
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.put("/preferences/sound", AuthMiddleware, UpdateSoundPreferences)

/**
 * @swagger
 * /api/preferences/playback:
 *   get:
 *     tags:
 *       - Preferences
 *     summary: Get the current user's playback settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Playback settings returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.get("/preferences/playback", AuthMiddleware, GetPlaybackPreferences)

/**
 * @swagger
 * /api/preferences/playback:
 *   put:
 *     tags:
 *       - Preferences
 *     summary: Partially update the current user's playback settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               background_playback:
 *                 type: boolean
 *               default_timer_minutes:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 0
 *               fade_enabled:
 *                 type: boolean
 *               end_behaviour:
 *                 type: string
 *                 enum: [silent, gentle_tone]
 *               quality:
 *                 type: string
 *                 enum: [standard, high]
 *               autoplay_next:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: Playback settings updated successfully
 *       '400':
 *         description: Invalid setting value
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.put("/preferences/playback", AuthMiddleware, UpdatePlaybackPreferences)

/**
 * @swagger
 * /api/preferences/downloads:
 *   get:
 *     tags:
 *       - Preferences
 *     summary: Get the current user's download settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Download settings returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.get("/preferences/downloads", AuthMiddleware, GetDownloadPreferences)

/**
 * @swagger
 * /api/preferences/downloads:
 *   put:
 *     tags:
 *       - Preferences
 *     summary: Partially update the current user's download settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wifi_only:
 *                 type: boolean
 *               quality:
 *                 type: string
 *                 enum: [standard, high]
 *     responses:
 *       '200':
 *         description: Download settings updated successfully
 *       '400':
 *         description: Invalid setting value
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.put("/preferences/downloads", AuthMiddleware, UpdateDownloadPreferences)

/**
 * @swagger
 * /api/preferences/privacy:
 *   get:
 *     tags:
 *       - Preferences
 *     summary: Get the current user's privacy settings
 *     description: >
 *       Returns data.settings with analytics_enabled, the user's consent for
 *       anonymous usage analytics. Off by default. While false, authenticated
 *       events posted to /api/analytics/events are accepted and discarded.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Privacy settings returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.get("/preferences/privacy", AuthMiddleware, GetPrivacyPreferences)

/**
 * @swagger
 * /api/preferences/privacy:
 *   put:
 *     tags:
 *       - Preferences
 *     summary: Set the current user's analytics consent
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [analytics_enabled]
 *             properties:
 *               analytics_enabled:
 *                 type: boolean
 *     responses:
 *       '200':
 *         description: Privacy settings updated successfully
 *       '400':
 *         description: Missing or non-boolean analytics_enabled
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PreferencesRoutes.put("/preferences/privacy", AuthMiddleware, UpdatePrivacyPreferences)

export default PreferencesRoutes
