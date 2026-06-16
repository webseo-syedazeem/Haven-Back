import express from "express"
import { GetTodayChecklist, ToggleTask, GetAllChecklists } from "../Controller/Checklist.ts"
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
 * /api/checklist/today:
 *   get:
 *     tags:
 *       - Checklist
 *     summary: Get today's checklist — all 6 fixed tasks with completed status
 *     description: >
 *       Always returns all 6 science-backed tasks (Morning Sunlight, Breathwork,
 *       Movement, Hydration, Deep Work, Wind-down) with completed true/false.
 *       No row needs to exist — if user hasn't ticked anything yet, all tasks
 *       come back as completed: false.
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
 *                     checklist_id:
 *                       type: string
 *                       nullable: true
 *                     date:
 *                       type: string
 *                       format: date
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: Morning Sunlight
 *                           description:
 *                             type: string
 *                           duration:
 *                             type: string
 *                             example: 10 min
 *                           icon:
 *                             type: string
 *                           completed:
 *                             type: boolean
 *                     completed_count:
 *                       type: integer
 *                       example: 3
 *                     total:
 *                       type: integer
 *                       example: 6
 *                     percentage:
 *                       type: number
 *                       example: 50
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.get("/checklist/today", AuthMiddleware, GetTodayChecklist)

/**
 * @swagger
 * /api/checklist/task:
 *   patch:
 *     tags:
 *       - Checklist
 *     summary: Toggle a single task completed or uncompleted
 *     description: >
 *       User taps one task in the checklist screen.
 *       Pass the task name and completed true/false.
 *       Auto-creates today's row if it doesn't exist yet.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - task
 *               - completed
 *             properties:
 *               task:
 *                 type: string
 *                 enum: [Morning Sunlight, Breathwork, Movement, Hydration, Deep Work, Wind-down]
 *                 example: Morning Sunlight
 *               completed:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       '200':
 *         description: Task toggled successfully — returns full updated task list
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
 *                     checklist_id:
 *                       type: string
 *                     date:
 *                       type: string
 *                       format: date
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           completed:
 *                             type: boolean
 *                     completed_count:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     percentage:
 *                       type: number
 *       '400':
 *         description: Invalid task name or missing completed boolean
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.patch("/checklist/task", AuthMiddleware, ToggleTask)

/**
 * @swagger
 * /api/checklist:
 *   get:
 *     tags:
 *       - Checklist
 *     summary: Get all checklists history for current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Checklists returned successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
ChecklistRoutes.get("/checklist", AuthMiddleware, GetAllChecklists)

export default ChecklistRoutes