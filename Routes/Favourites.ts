import express from "express"
import { AddFavourite, GetFavourites, RemoveFavourite } from "../Controller/Favourites.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const FavouritesRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Favourites
 *     description: Saved soundscape routes
 */

/**
 * @swagger
 * /api/favourites:
 *   post:
 *     tags:
 *       - Favourites
 *     summary: Save a live soundscape for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               soundscape_id:
 *                 type: string
 *                 format: uuid
 *             required:
 *               - soundscape_id
 *     responses:
 *       '200':
 *         description: Soundscape saved successfully
 *       '400':
 *         description: Invalid, unavailable, or already favourited soundscape
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
FavouritesRoutes.post("/favourites", AuthMiddleware, AddFavourite)

/**
 * @swagger
 * /api/favourites:
 *   get:
 *     tags:
 *       - Favourites
 *     summary: Get the authenticated user's saved soundscapes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Favourites returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
FavouritesRoutes.get("/favourites", AuthMiddleware, GetFavourites)

/**
 * @swagger
 * /api/favourites/{soundscapeId}:
 *   delete:
 *     tags:
 *       - Favourites
 *     summary: Remove a soundscape from the authenticated user's favourites
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: soundscapeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Favourite removed successfully
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Favourite not found
 *       '500':
 *         description: Server error
 */
FavouritesRoutes.delete("/favourites/:soundscapeId", AuthMiddleware, RemoveFavourite)

export default FavouritesRoutes
