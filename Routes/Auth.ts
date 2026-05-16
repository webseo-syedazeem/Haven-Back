import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    SignUp,
    SignIn,
    ForgotPassword,
    ResetPassword,
    ChangePassword,
    GetCurrentUser,
} from "../Controller/Auth.ts"

const AuthRoutes = express.Router()

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication routes
 */

/**
 * @swagger
 * /api/signup:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Sign up a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: strongPassword123
 *               username:
 *                 type: string
 *                 example: havenuser
 *             required:
 *               - email
 *               - password
 *               - username
 *     responses:
 *       '200':
 *         description: User registered successfully
 *       '400':
 *         description: Bad request
 *       '500':
 *         description: Server error
 */
AuthRoutes.post("/signup", SignUp)

/**
 * @swagger
 * /api/signin:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Sign in an existing user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *             required:
 *               - email
 *               - password
 *     responses:
 *       '200':
 *         description: User signed in successfully
 *       '400':
 *         description: Bad request
 *       '401':
 *         description: Invalid credentials
 */
AuthRoutes.post("/signin", SignIn)

/**
 * @swagger
 * /api/forgot-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Send password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *             required:
 *               - email
 *     responses:
 *       '200':
 *         description: Password reset email sent
 *       '400':
 *         description: Bad request
 */
AuthRoutes.post("/forgot-password", ForgotPassword)

/**
 * @swagger
 * /api/reset-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Reset user password with a valid reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *             required:
 *               - newPassword
 *     responses:
 *       '200':
 *         description: Password reset successfully
 *       '400':
 *         description: Bad request or invalid token
 */
AuthRoutes.post("/reset-password", ResetPassword)

/**
 * @swagger
 * /api/change-password:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Change password for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *             required:
 *               - oldPassword
 *               - newPassword
 *     responses:
 *       '200':
 *         description: Password changed successfully
 *       '400':
 *         description: Bad request
 *       '401':
 *         description: Authentication failed
 */
AuthRoutes.post("/change-password", AuthMiddleware, ChangePassword)

/**
 * @swagger
 * /api/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current user returned
 *       '401':
 *         description: Invalid or missing session
 */
AuthRoutes.get("/me", AuthMiddleware, GetCurrentUser)

export default AuthRoutes