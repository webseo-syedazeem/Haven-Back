export type AudioByteRange = {
    start: number
    end: number
}

/**
 * Parses the single byte range used by AVPlayer and ExoPlayer.
 *
 * An open-ended request such as `bytes=0-` means "from zero to the end of the
 * file". It must not be silently shortened to an application-sized chunk: the
 * player already controls how much it consumes by closing the response or by
 * issuing a narrower range request.
 */
export const parseAudioByteRange = (
    header: string,
    fileSize: number
): AudioByteRange | null => {
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return null

    const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
    if (!match || (!match[1] && !match[2])) return null

    const startText = match[1]
    const endText = match[2]

    if (!startText) {
        const suffixLength = Number(endText)
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null

        return {
            start: Math.max(fileSize - suffixLength, 0),
            end: fileSize - 1,
        }
    }

    const start = Number(startText)
    const requestedEnd = endText ? Number(endText) : fileSize - 1
    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(requestedEnd) ||
        start < 0 ||
        start >= fileSize ||
        requestedEnd < start
    ) {
        return null
    }

    return {
        start,
        end: Math.min(requestedEnd, fileSize - 1),
    }
}
