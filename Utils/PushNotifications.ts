export type PushPayload = {
    title: string
    body: string
    data?: Record<string, unknown>
}

export type PushResult = {
    configured: boolean
    sent: string[]
    failed: string[]
}

// Actual provider call, isolated in its own function so it is easy to swap for
// APNs/Expo or a real FCM v1 integration once the user supplies credentials.
// Uses the legacy FCM HTTP API (server key auth) as a minimal default.
const sendViaFcm = async (tokens: string[], payload: PushPayload, serverKey: string): Promise<PushResult> => {
    const sent: string[] = []
    const failed: string[] = []

    for (const token of tokens) {
        try {
            const response = await fetch("https://fcm.googleapis.com/fcm/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `key=${serverKey}`,
                },
                body: JSON.stringify({
                    to: token,
                    notification: { title: payload.title, body: payload.body },
                    data: payload.data || {},
                }),
            })

            if (response.ok) {
                sent.push(token)
            } else {
                console.error(`[Push] FCM send failed for token ending ${token.slice(-6)}: ${response.status}`)
                failed.push(token)
            }
        } catch (err) {
            console.error("[Push] FCM send error:", err)
            failed.push(token)
        }
    }

    return { configured: true, sent, failed }
}

// Provider credentials (FCM_SERVER_KEY) belong to the user, not this codebase.
// Without them we degrade gracefully: callers keep their notifications_log rows
// "queued" instead of crashing or silently dropping them.
export const sendPush = async (tokens: string[], payload: PushPayload): Promise<PushResult> => {
    const fcmServerKey = process.env.FCM_SERVER_KEY

    if (tokens.length === 0) {
        return { configured: Boolean(fcmServerKey), sent: [], failed: [] }
    }

    if (!fcmServerKey) {
        console.log("[Push] FCM_SERVER_KEY not configured — leaving notifications queued")
        return { configured: false, sent: [], failed: [] }
    }

    return sendViaFcm(tokens, payload, fcmServerKey)
}
