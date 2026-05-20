import express from "express"
import { SaveGoals, UpdateGoals, GetGoals } from "../Controller/Goals.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const GoalsRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Goals
 *     description: User goals routes
 */

/**
 * @swagger
 * /api/goals:
 *   post:
 *     tags:
 *       - Goals
 *     summary: Save current authenticated user's goals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Reduce Stress, Sleep Better, Self Care, Improve Mood, Mind Less]
 *                 example: [Reduce Stress, Sleep Better]
 *             required:
 *               - goals
 *     responses:
 *       '200':
 *         description: Goals saved successfully
 *       '400':
 *         description: Goals already saved or invalid goals
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
GoalsRoutes.post("/goals", AuthMiddleware, SaveGoals)

/**
 * @swagger
 * /api/goals:
 *   put:
 *     tags:
 *       - Goals
 *     summary: Update current authenticated user's goals
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Reduce Stress, Sleep Better, Self Care, Improve Mood, Mind Less]
 *                 example: [Self Care, Improve Mood]
 *             required:
 *               - goals
 *     responses:
 *       '200':
 *         description: Goals updated successfully
 *       '400':
 *         description: Missing or invalid goals
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Goals not found
 *       '500':
 *         description: Server error
 */
GoalsRoutes.put("/goals", AuthMiddleware, UpdateGoals)

/**
 * @swagger
 * /api/goals:
 *   get:
 *     tags:
 *       - Goals
 *     summary: Get current authenticated user's goals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Goals returned successfully
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
 *                     goals:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
GoalsRoutes.get("/goals", AuthMiddleware, GetGoals)

export default GoalsRoutes
