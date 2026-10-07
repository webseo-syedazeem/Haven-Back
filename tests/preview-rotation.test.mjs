import assert from 'node:assert/strict'
import test from 'node:test'

import {
    getPreviewCombinationCount,
    selectPreviewCombination,
} from '../dist/Utils/PreviewRotation.js'

test('thirty consecutive preview calls receive thirty different three-item groups', () => {
    const pool = Array.from({ length: 10 }, (_, index) => `soundscape-${index + 1}`)
    const groups = Array.from({ length: 30 }, (_, sequence) =>
        selectPreviewCombination(pool, 3, BigInt(sequence))
    )

    assert.equal(new Set(groups.map((group) => [...group].sort().join('|'))).size, 30)
    for (const group of groups) {
        assert.equal(group.length, 3)
        assert.equal(new Set(group).size, 3)
        assert.deepEqual(group, [...group].sort((a, b) => pool.indexOf(a) - pool.indexOf(b)))
    }
})

test('a group repeats only after all possible combinations have been used', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f']
    const total = getPreviewCombinationCount(pool.length, 3)
    const groups = Array.from({ length: Number(total) }, (_, sequence) =>
        selectPreviewCombination(pool, 3, BigInt(sequence)).join('|')
    )

    assert.equal(total, 20n)
    assert.equal(new Set(groups).size, Number(total))
    assert.equal(selectPreviewCombination(pool, 3, total).join('|'), groups[0])
})

test('small or empty catalogues return safely without padding or duplicates', () => {
    assert.deepEqual(selectPreviewCombination(['a', 'b'], 3, 99n), ['a', 'b'])
    assert.deepEqual(selectPreviewCombination([], 3, 99n), [])
    assert.deepEqual(selectPreviewCombination(['a', 'b'], 0, 99n), [])
})
