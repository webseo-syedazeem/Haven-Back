export type PushPayload = { title: string; body: string; data?: Record<string, unknown> }
export type PushResult = { configured: boolean; sent: string[]; failed: string[] }

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
const isExpoToken = (token: string) => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token)

const sendViaExpo = async (tokens: string[], payload: PushPayload): Promise<PushResult> => {
    const sent: string[] = []
    const failed: string[] = []
    for (let offset = 0; offset < tokens.length; offset += 100) {
        const batch = tokens.slice(offset, offset + 100)
        try {
            const response = await fetch(EXPO_PUSH_URL, {
                method: "POST",
                headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
                body: JSON.stringify(batch.map((to) => ({ to, sound: "default", title: payload.title, body: payload.body, data: payload.data || {} }))),
            })
            if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`)
            const result = await response.json() as { data?: Array<{ status?: string }> }
            batch.forEach((token, index) => {
                if (result.data?.[index]?.status === "ok") sent.push(token)
                else failed.push(token)
            })
        } catch (error) {
            console.error("[Push] Expo send error:", error)
            failed.push(...batch)
        }
    }
    return { configured: true, sent, failed }
}

/** Expo tokens are sent to Expo, which routes each notification to APNs/FCM. */
export const sendPush = async (tokens: string[], payload: PushPayload): Promise<PushResult> => {
    const valid = tokens.filter(isExpoToken)
    const invalid = tokens.filter((token) => !isExpoToken(token))
    if (!valid.length) return { configured: true, sent: [], failed: invalid }
    const result = await sendViaExpo(valid, payload)
    return { ...result, failed: [...invalid, ...result.failed] }
}
