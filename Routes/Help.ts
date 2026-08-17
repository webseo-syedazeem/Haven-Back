import express from "express"
import {
    CreateAdminHelpArticle,
    DeleteAdminHelpArticle,
    GetAdminHelpArticles,
    GetHelpArticle,
    GetHelpArticles,
    GetOneAdminHelpArticle,
    PublishAdminHelpArticle,
    UpdateAdminHelpArticle,
} from "../Controller/Help.ts"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import { AdminAuthMiddleware } from "../Middleware/AdminAuthMiddleware.ts"

const HelpRoutes = express.Router()
const requireAdmin = [AuthMiddleware, AdminAuthMiddleware] as const

/**
 * @swagger
 * tags:
 *   - name: Help
 *     description: Public help centre routes
 *   - name: Admin Help
 *     description: Admin-authored help centre content management
 */

/**
 * @swagger
 * /api/help:
 *   get:
 *     tags:
 *       - Help
 *     summary: Get published help articles grouped by category
 *     responses:
 *       '200':
 *         description: Help categories returned successfully
 *       '500':
 *         description: Server error
 */
HelpRoutes.get("/help", GetHelpArticles)

/**
 * @swagger
 * /api/help/{slug}:
 *   get:
 *     tags:
 *       - Help
 *     summary: Get one published help article
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Help article returned successfully
 *       '404':
 *         description: Help article not found or not published
 *       '500':
 *         description: Server error
 */
HelpRoutes.get("/help/:slug", GetHelpArticle)

/**
 * @swagger
 * /api/admin/help:
 *   post:
 *     tags: [Admin Help]
 *     summary: Create an unpublished help article
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, category, title, body]
 *             properties:
 *               slug: { type: string }
 *               category: { type: string }
 *               title: { type: string }
 *               body: { type: string }
 *               sort_order: { type: integer, minimum: 0 }
 *     responses:
 *       '201': { description: Unpublished help article created }
 *       '400': { description: Invalid input or duplicate slug }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 *   get:
 *     tags: [Admin Help]
 *     summary: List all help articles including unpublished
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200': { description: Help articles returned successfully }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 */
HelpRoutes.post("/admin/help", ...requireAdmin, CreateAdminHelpArticle)
HelpRoutes.get("/admin/help", ...requireAdmin, GetAdminHelpArticles)

/**
 * @swagger
 * /api/admin/help/{id}:
 *   get:
 *     tags: [Admin Help]
 *     summary: Get one help article regardless of publication status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Help article returned successfully }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 *       '404': { description: Help article not found }
 *   put:
 *     tags: [Admin Help]
 *     summary: Partially update editable help article fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       '200': { description: Help article updated successfully }
 *       '400': { description: Invalid update or duplicate slug }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 *       '404': { description: Help article not found }
 *   delete:
 *     tags: [Admin Help]
 *     summary: Permanently delete a help article
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200': { description: Help article deleted }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 *       '404': { description: Help article not found }
 */
HelpRoutes.get("/admin/help/:id", ...requireAdmin, GetOneAdminHelpArticle)
HelpRoutes.put("/admin/help/:id", ...requireAdmin, UpdateAdminHelpArticle)
HelpRoutes.delete("/admin/help/:id", ...requireAdmin, DeleteAdminHelpArticle)

/**
 * @swagger
 * /api/admin/help/{id}/publish:
 *   put:
 *     tags: [Admin Help]
 *     summary: Publish or unpublish a help article
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_published]
 *             properties:
 *               is_published: { type: boolean }
 *     responses:
 *       '200': { description: Publication state updated }
 *       '400': { description: Invalid publication state }
 *       '401': { description: Invalid or missing session }
 *       '403': { description: Admin access required }
 *       '404': { description: Help article not found }
 */
HelpRoutes.put("/admin/help/:id/publish", ...requireAdmin, PublishAdminHelpArticle)

export default HelpRoutes
