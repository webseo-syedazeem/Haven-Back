import express from "express"
import { AddFavourite, RemoveFavourite, GetFavourites } from "../Controller/Favourites.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const FavouritesRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Favourites
 *     description: User favourites routes
 */

/**
 * @swagger
 * /api/favourites:
 *   post:
 *     tags:
 *       - Favourites
 *     summary: Add a favourite tool for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tool_type:
 *                 type: string
 *                 enum: [breathing, soundscape, checklist]
 *                 example: breathing
 *               tool_id:
 *                 type: string
 *                 example: box-breathing
 *               tool_name:
 *                 type: string
 *                 example: Box Breathing
 *             required:
 *               - tool_type
 *               - tool_id
 *               - tool_name
 *     responses:
 *       '200':
 *         description: Favourite added successfully
 *       '400':
 *         description: Already in favourites or invalid data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
FavouritesRoutes.post("/favourites", AuthMiddleware, AddFavourite)

/**
 * @swagger
 * /api/favourites/{id}:
 *   delete:
 *     tags:
 *       - Favourites
 *     summary: Remove a favourite for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Favourite record id
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
FavouritesRoutes.delete("/favourites/:id", AuthMiddleware, RemoveFavourite)

/**
 * @swagger
 * /api/favourites:
 *   get:
 *     tags:
 *       - Favourites
 *     summary: Get current authenticated user's favourites
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Favourites returned successfully
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
 *                     favourites:
 *                       type: array
 *                       items:
 *                         type: object
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
FavouritesRoutes.get("/favourites", AuthMiddleware, GetFavourites)

export default FavouritesRoutes
