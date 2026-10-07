const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
    let a = left < 0n ? -left : left
    let b = right < 0n ? -right : right

    while (b !== 0n) {
        const remainder = a % b
        a = b
        b = remainder
    }

    return a
}

const combinationCount = (itemCount: number, selectionCount: number): bigint => {
    if (selectionCount < 0 || itemCount < selectionCount) return 0n

    const smallerSide = Math.min(selectionCount, itemCount - selectionCount)
    let result = 1n

    for (let index = 1; index <= smallerSide; index += 1) {
        result = result * BigInt(itemCount - smallerSide + index) / BigInt(index)
    }

    return result
}

const spreadStep = (total: bigint): bigint => {
    if (total <= 2n) return 1n

    let candidate = total / 2n + 1n
    while (candidate < total && greatestCommonDivisor(candidate, total) !== 1n) {
        candidate += 1n
    }

    return candidate < total ? candidate : 1n
}

const combinationIndexesAt = (
    itemCount: number,
    selectionCount: number,
    rank: bigint,
): number[] => {
    const indexes: number[] = []
    let nextCandidate = 0
    let remainingRank = rank

    for (let remaining = selectionCount; remaining > 0; remaining -= 1) {
        for (
            let candidate = nextCandidate;
            candidate <= itemCount - remaining;
            candidate += 1
        ) {
            const blockSize = combinationCount(itemCount - candidate - 1, remaining - 1)

            if (remainingRank < blockSize) {
                indexes.push(candidate)
                nextCandidate = candidate + 1
                break
            }

            remainingRank -= blockSize
        }
    }

    return indexes
}

/**
 * Selects one unique, ranked-order-preserving combination for a sequence slot.
 * Consecutive slots cannot repeat a group until every possible combination has
 * been used. The coprime step spreads adjacent calls across the catalogue.
 */
export const selectPreviewCombination = <T>(
    items: readonly T[],
    requestedCount: number,
    sequence: bigint,
): T[] => {
    const count = Math.min(Math.max(0, Math.trunc(requestedCount)), items.length)
    if (count === 0) return []
    if (count === items.length) return [...items]

    const total = combinationCount(items.length, count)
    const normalizedSequence = ((sequence % total) + total) % total
    const rank = normalizedSequence * spreadStep(total) % total

    return combinationIndexesAt(items.length, count, rank).map((index) => items[index])
}

export const getPreviewCombinationCount = (
    itemCount: number,
    selectionCount: number,
): bigint => combinationCount(itemCount, selectionCount)
