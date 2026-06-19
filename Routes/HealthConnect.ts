// Haven - HealthConnect Integration
import express from "express"
import { AuthMiddleware } from "../Middleware/AuthMiddleware.ts"
import {
    disconnectProvider,
    getConnectionStatus,
    saveConnection,
} from "../Controller/HealthConnect.ts"

const HealthConnectRoutes = express.Router()

HealthConnectRoutes.post("/health-connect/save", AuthMiddleware, saveConnection)
HealthConnectRoutes.get("/health-connect/status/:userId", AuthMiddleware, getConnectionStatus)
HealthConnectRoutes.delete("/health-connect/disconnect", AuthMiddleware, disconnectProvider)

export default HealthConnectRoutes