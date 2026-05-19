import express from "express"
import { SaveChecklist, UpdateChecklist, GetAllChecklists, GetTodayChecklist } from "../Controller/Checklist.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"

const ChecklistRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Checklist
 *     description: Daily checklist routes
 */

/**
 * @swagger
 * /api/checklist:
 *   post:
 *     tags:
 *       - Checklist
 *     summary: Save today's checklist for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completed_tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Morning Sunlight, Breathwork, Movement, Hydration, Deep Work, Wind-down]
 *                 example: [Morning Sunlight, Hydration, Deep Work]
 *             required:
 *               - completed_tasks
 *     responses:
 *       '200':
 *         description: Checklist saved successfully
 *       '400':
 *         description: Missing or invalid checklist data
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.post("/checklist", AuthMiddleware, SaveChecklist)

/**
 * @swagger
 * /api/checklist:
 *   get:
 *     tags:
 *       - Checklist
 *     summary: Get all checklists for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Checklists returned successfully
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
 *                     checklists:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           percentage:
 *                             type: number
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.get("/checklist", AuthMiddleware, GetAllChecklists)

/**
 * @swagger
 * /api/checklist/today:
 *   get:
 *     tags:
 *       - Checklist
 *     summary: Get today's checklist for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Today's checklist returned successfully
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
 *                     checklist:
 *                       type: object
 *                       nullable: true
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.get("/checklist/today", AuthMiddleware, GetTodayChecklist)

/**
 * @swagger
 * /api/checklist/{id}:
 *   put:
 *     tags:
 *       - Checklist
 *     summary: Update current authenticated user's checklist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Checklist id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completed_tasks:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Morning Sunlight, Breathwork, Movement, Hydration, Deep Work, Wind-down]
 *                 example: [Morning Sunlight, Breathwork, Movement, Hydration]
 *             required:
 *               - completed_tasks
 *     responses:
 *       '200':
 *         description: Checklist updated successfully
 *       '400':
 *         description: Missing or invalid checklist data
 *       '401':
 *         description: Invalid or missing session
 *       '404':
 *         description: Checklist not found
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.put("/checklist/:id", AuthMiddleware, UpdateChecklist)

export default ChecklistRoutes
