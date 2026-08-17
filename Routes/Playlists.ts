import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    AddPlaylistItem,
    CreatePlaylist,
    DeletePlaylist,
    GetOnePlaylist,
    GetPlaylists,
    RemovePlaylistItem,
    ReorderPlaylistItems,
    UpdatePlaylist,
} from "../Controller/Playlists.ts"

const PlaylistsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Playlists
 *     description: Authenticated user playlist routes
 */

/**
 * @swagger
 * /api/playlists:
 *   post:
 *     tags:
 *       - Playlists
 *     summary: Create a playlist
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               cover_image_url:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '201':
 *         description: Playlist created
 *       '400':
 *         description: Invalid playlist data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.post("/playlists", AuthMiddleware, CreatePlaylist)

/**
 * @swagger
 * /api/playlists:
 *   get:
 *     tags:
 *       - Playlists
 *     summary: List the current user's playlists with item counts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Playlists returned
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.get("/playlists", AuthMiddleware, GetPlaylists)

/**
 * @swagger
 * /api/playlists/{id}/items:
 *   post:
 *     tags:
 *       - Playlists
 *     summary: Add a live soundscape to the end of a playlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [soundscape_id]
 *             properties:
 *               soundscape_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       '201':
 *         description: Playlist item added
 *       '400':
 *         description: Invalid, unpublished, or duplicate soundscape
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.post("/playlists/:id/items", AuthMiddleware, AddPlaylistItem)

/**
 * @swagger
 * /api/playlists/{id}/items/{soundscapeId}:
 *   delete:
 *     tags:
 *       - Playlists
 *     summary: Remove one soundscape from a playlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: soundscapeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Playlist item removed
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist or item not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.delete(
    "/playlists/:id/items/:soundscapeId",
    AuthMiddleware,
    RemovePlaylistItem
)

/**
 * @swagger
 * /api/playlists/{id}/reorder:
 *   put:
 *     tags:
 *       - Playlists
 *     summary: Replace the order of all playlist items
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [soundscape_ids]
 *             properties:
 *               soundscape_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       '200':
 *         description: Playlist reordered
 *       '400':
 *         description: Replacement list does not match current items
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.put("/playlists/:id/reorder", AuthMiddleware, ReorderPlaylistItems)

/**
 * @swagger
 * /api/playlists/{id}:
 *   get:
 *     tags:
 *       - Playlists
 *     summary: Get one owned playlist with ordered live soundscapes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Playlist returned
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.get("/playlists/:id", AuthMiddleware, GetOnePlaylist)

/**
 * @swagger
 * /api/playlists/{id}:
 *   put:
 *     tags:
 *       - Playlists
 *     summary: Update an owned playlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               cover_image_url:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Playlist updated
 *       '400':
 *         description: Invalid update
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.put("/playlists/:id", AuthMiddleware, UpdatePlaylist)

/**
 * @swagger
 * /api/playlists/{id}:
 *   delete:
 *     tags:
 *       - Playlists
 *     summary: Delete an owned playlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Playlist deleted
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Playlist not found
 *       '500':
 *         description: Server error
 */
PlaylistsRoutes.delete("/playlists/:id", AuthMiddleware, DeletePlaylist)

export default PlaylistsRoutes