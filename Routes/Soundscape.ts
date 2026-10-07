import express from "express"
import {
    GetAllSoundscapes,
    GetCollections,
    GetExploreGroups,
    GetLibrary,
    GetOneCollection,
    GetOneSoundscape,
    GetPopularCollections,
    GetSearchSuggestions,
    GetSimilarSoundscapes,
    GetSoundscapesByMode,
    GetSoundscapesModePreview,
    SearchSoundscapes,
} from "../Controller/Soundscape.ts"
import { OptionalAuthMiddleware } from "../Middleware/OptionalAuthMiddleware.ts"

const SoundscapeRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Soundscapes
 *     description: Public soundscape catalogue routes
 *   - name: Collections
 *     description: Public curated collection routes
 *   - name: Library
 *     description: Public soundscape filtering and sorting routes
 */

/**
 * @swagger
 * /api/library:
 *   get:
 *     tags:
 *       - Library
 *     summary: Filter and sort the live soundscape library
 *     parameters:
 *       - in: query
 *         name: modes
 *         schema:
 *           type: string
 *         description: Comma-separated soundscape modes
 *       - in: query
 *         name: environments
 *         schema:
 *           type: string
 *         description: Comma-separated environments
 *       - in: query
 *         name: contains
 *         schema:
 *           type: string
 *         description: Comma-separated sounds that must be present
 *       - in: query
 *         name: avoids
 *         schema:
 *           type: string
 *         description: Comma-separated sounds to avoid
 *       - in: query
 *         name: animals
 *         schema:
 *           type: string
 *         description: Comma-separated animals
 *       - in: query
 *         name: instruments
 *         schema:
 *           type: string
 *         description: Comma-separated instruments
 *       - in: query
 *         name: detail_levels
 *         schema:
 *           type: string
 *         description: Comma-separated detail levels
 *       - in: query
 *         name: min_duration
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Minimum duration in seconds
 *       - in: query
 *         name: max_duration
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Maximum duration in seconds
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: recommended
 *           enum: [recommended, most_played, most_saved, recently_added, a_z, shortest, longest, lowest_intensity, highest_detail]
 *     responses:
 *       '200':
 *         description: Filtered live soundscapes returned successfully
 *       '400':
 *         description: Invalid query parameters
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/library", OptionalAuthMiddleware, GetLibrary)

/**
 * @swagger
 * /api/soundscapes:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get all live soundscapes grouped by mode and subcategory
 *     responses:
 *       '200':
 *         description: Live soundscapes returned successfully
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes", GetAllSoundscapes)

/**
 * @swagger
 * /api/soundscapes/search:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Search live soundscapes
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Text to match against searchable soundscape fields
 *     responses:
 *       '200':
 *         description: Matching live soundscapes returned successfully
 *       '400':
 *         description: Missing search query
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/search", SearchSoundscapes)

/**
 * @swagger
 * /api/soundscapes/suggestions:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get precise search suggestions (title/subcategory matches) for a query
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Text to match against soundscape title or subcategory
 *     responses:
 *       '200':
 *         description: Matching live soundscape suggestions returned successfully
 *       '400':
 *         description: Missing search query
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/suggestions", GetSearchSuggestions)

/**
 * @swagger
 * /api/soundscapes/mode/{mode}:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get live soundscapes for one mode, grouped by subcategory
 *     parameters:
 *       - in: path
 *         name: mode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sleep, relax, focus]
 *     responses:
 *       '200':
 *         description: Live soundscapes returned successfully
 *       '400':
 *         description: Invalid mode
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/mode/:mode", GetSoundscapesByMode)

/**
 * @swagger
 * /api/soundscapes/mode/{mode}/preview:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get a short flat list of live soundscapes for one mode (onboarding preview)
 *     description: >
 *       Guest-accessible - no auth. Returns a rotating combination of `count` live
 *       soundscapes as a FLAT array (no subcategory grouping). Concurrent requests use
 *       atomic rotation slots, so the same group is not repeated until every possible
 *       group has been served. Items within a group retain catalogue ranking order.
 *       If the mode has fewer than `count` live soundscapes, only those are returned -
 *       the list is never padded and a mode with none live returns an empty array.
 *       Each element is the same soundscape object the other soundscape endpoints return.
 *       The eligible catalogue pool is cached per mode and cleared whenever a soundscape
 *       is created, updated, published or changes status.
 *     parameters:
 *       - in: path
 *         name: mode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sleep, relax, focus]
 *       - in: query
 *         name: count
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *           default: 3
 *         description: Number of soundscapes to return.
 *     responses:
 *       '200':
 *         description: Live soundscapes returned successfully (possibly fewer than count)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     mode:
 *                       type: string
 *                       enum: [sleep, relax, focus]
 *                     soundscapes:
 *                       type: array
 *                       description: Rotating flat list, at most `count` long, in ranked order.
 *                       items:
 *                         $ref: '#/components/schemas/Soundscape'
 *       '400':
 *         description: Invalid mode, or count is not an integer between 1 and 10
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/mode/:mode/preview", GetSoundscapesModePreview)

/**
 * @swagger
 * /api/soundscapes/{id}/details:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get the full details for one live soundscape
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Live soundscape returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     soundscape:
 *                       $ref: '#/components/schemas/Soundscape'
 *       '404':
 *         description: Soundscape not found or not live
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:id/details", GetOneSoundscape)

/**
 * @swagger
 * /api/soundscapes/{id}/similar:
 *   get:
 *     tags:
 *       - Soundscapes
 *     summary: Get related live soundscapes for one live soundscape (Similar Places)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Similar live soundscapes returned successfully
 *       '404':
 *         description: Soundscape not found or not live
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/soundscapes/:id/similar", GetSimilarSoundscapes)

/**
 * @swagger
 * /api/collections:
 *   get:
 *     tags:
 *       - Collections
 *     summary: Get all published collections
 *     responses:
 *       '200':
 *         description: Published collections returned successfully
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/collections", GetCollections)

/**
 * @swagger
 * /api/collections/popular:
 *   get:
 *     tags:
 *       - Collections
 *     summary: Get published collections ordered by a popularity signal (Home tab)
 *     description: >
 *       Popularity is derived from existing engagement data — aggregate play_history
 *       count plus favourites count across each collection's live member soundscapes —
 *       rather than a manually curated ranking.
 *     responses:
 *       '200':
 *         description: Popular published collections returned successfully
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/collections/popular", GetPopularCollections)

/**
 * @swagger
 * /api/collections/{id}:
 *   get:
 *     tags:
 *       - Collections
 *     summary: Get one published collection with its live soundscapes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Published collection returned successfully
 *       '404':
 *         description: Collection not found or not published
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/collections/:id", GetOneCollection)

/**
 * @swagger
 * /api/explore:
 *   get:
 *     tags:
 *       - Collections
 *     summary: Get published collections with live members, grouped for Explore
 *     description: >
 *       Collections without an explore_group fall back to editorial. Collections
 *       with no live member soundscapes are omitted.
 *     responses:
 *       '200':
 *         description: Explore groups returned successfully
 *       '500':
 *         description: Server error
 */
SoundscapeRoutes.get("/explore", GetExploreGroups)

export default SoundscapeRoutes
