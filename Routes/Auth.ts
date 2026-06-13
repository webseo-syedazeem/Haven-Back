import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    SignUp,
    SignIn,
    GoogleSignIn,
    RefreshToken,
    ForgotPassword,
    ResetPassword,
    ChangePassword,
    UpdateName,
    RemoveProfileImage,
    Logout,
    DeleteAccount,
    CheckSession,
    GetCurrentUser,
} from "../Controller/Auth.ts"
import { ProfileImageUploadMiddleware, UploadProfileImage } from "../Controller/UploadProfileImage.ts"

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
 * /api/auth/google:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Sign in with a Google ID token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_token:
 *                 type: string
 *                 example: google-id-token
 *             required:
 *               - id_token
 *     responses:
 *       '200':
 *         description: Google sign in successful
 *       '400':
 *         description: Missing id_token
 *       '401':
 *         description: Invalid Google token
 *       '500':
 *         description: Server error
 */
AuthRoutes.post("/auth/google", GoogleSignIn)

/**
 * @swagger
 * /api/refresh-token:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Refresh authentication session with refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refresh_token:
 *                 type: string
 *                 example: refresh-token-value
 *             required:
 *               - refresh_token
 *     responses:
 *       '200':
 *         description: New session and user returned successfully
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
 *                     session:
 *                       type: object
 *                     user:
 *                       type: object
 *       '400':
 *         description: Missing refresh_token
 *       '401':
 *         description: Invalid refresh token
 *       '500':
 *         description: Server error
 */
AuthRoutes.post("/refresh-token", RefreshToken)

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
 * /api/update-name:
 *   put:
 *     tags:
 *       - Auth
 *     summary: Update name for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Jane
 *               last_name:
 *                 type: string
 *                 example: Doe
 *             required:
 *               - first_name
 *               - last_name
 *     responses:
 *       '200':
 *         description: Name updated successfully
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
 *                     user:
 *                       type: object
 *                     profile:
 *                       type: object
 *       '400':
 *         description: Bad request
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AuthRoutes.put("/update-name", AuthMiddleware, UpdateName)

/**
 * @swagger
 * /api/upload-profile-image:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Upload a profile image for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       '200':
 *         description: Profile image uploaded successfully
 *       '400':
 *         description: Missing, oversized, or unsupported image
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AuthRoutes.post("/upload-profile-image", AuthMiddleware, ProfileImageUploadMiddleware, UploadProfileImage)

/**
 * @swagger
 * /api/remove-profile-image:
 *   delete:
 *     tags:
 *       - Auth
 *     summary: Remove the profile image for the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Profile image removed successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AuthRoutes.delete("/remove-profile-image", AuthMiddleware, RemoveProfileImage)

/**
 * @swagger
 * /api/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Log out the current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Logged out successfully
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
 *                     message:
 *                       type: string
 *                       example: Logged out successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Server error
 */
AuthRoutes.post("/logout", AuthMiddleware, Logout)

/**
 * @swagger
 * /api/delete-account:
 *   delete:
 *     tags:
 *       - Auth
 *     summary: Delete the current authenticated user's account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Account deleted successfully
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
 *                     message:
 *                       type: string
 *                       example: Account deleted successfully
 *       '401':
 *         description: Invalid or missing session
 *       '500':
 *         description: Failed to delete account
 */
AuthRoutes.delete("/delete-account", AuthMiddleware, DeleteAccount)

/**
 * @swagger
 * /api/check-session:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Check if current session/token is valid
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Session is valid
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
 *                     valid:
 *                       type: boolean
 *                     user:
 *                       type: object
 *                     profile:
 *                       type: object
 *       '401':
 *         description: Invalid or expired session
 *       '500':
 *         description: Server error
 */
AuthRoutes.get("/check-session", AuthMiddleware, CheckSession)

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
