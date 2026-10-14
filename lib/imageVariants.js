// Shared resize logic for generating sm/md/lg cover-image variants.
//
// Used by BOTH:
//   - scripts/generate-image-variants.js (batch/backfill script, run directly with `node`)
//   - Controller/AdminImageUpload.ts (generates variants for every new upload)
//
// Kept as plain ESM JavaScript (not compiled TypeScript) so the batch script can run it
// directly with `node` with no build step. Controller/AdminImageUpload.ts imports this same
// file (types come from the sibling imageVariants.d.ts) so there is exactly one place that
// knows how to resize a cover image — no duplicated sharp pipelines.
//
// Rules enforced here (do not relax without re-reading the product constraints):
//   - WebP only, never change format.
//   - Preserve aspect ratio exactly (resize by width only; sharp computes height).
//   - Never upscale: `withoutEnlargement: true` keeps the source's native width when it is
//     already narrower than the variant's target width.
//   - Never crop: no `fit: cover` style resize is used here.
//   - Never touch the original file; callers decide where the original lives.

import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

/**
 * One entry per generated subfolder. `width: null` means "do not resize the width at all" —
 * used for `lg`, which is the original dimensions re-encoded at a slightly lower quality than
 * the master copy (which is saved at quality 90 in AdminImageUpload.ts).
 */
export const VARIANTS = [
    { dir: "sm", width: 480, quality: 75 },
    { dir: "md", width: 800, quality: 80 },
    { dir: "lg", width: null, quality: 80 },
]

/**
 * Render a single variant from an input (Buffer or source file path) and return the encoded
 * WebP bytes. Never upscales and never crops.
 */
async function renderVariant(input, spec) {
    let pipeline = sharp(input, { limitInputPixels: 40_000_000 }).rotate()

    if (spec.width) {
        pipeline = pipeline.resize({ width: spec.width, withoutEnlargement: true })
    }

    return pipeline.webp({ quality: spec.quality, smartSubsample: true }).toBuffer()
}

/**
 * Generate the sm/md/lg variants for one image into `<destBaseDir>/<variant>/<filename>`.
 *
 * @param {Buffer | string} input - the already-validated WebP image, as a Buffer (upload path)
 *   or a path to the original file on disk (batch-script path).
 * @param {string} destBaseDir - the directory that contains (or will contain) sm/, md/, lg/.
 *   This is normally the same directory the original lives in.
 * @param {string} filename - output filename, identical across sm/md/lg and (conventionally)
 *   identical to the original's filename.
 * @param {{ force?: boolean }} [options] - pass `force: true` to regenerate even if a variant
 *   file already exists on disk.
 * @returns {Promise<Array<{ variant: string, path: string, bytes: number, skipped: boolean }>>}
 */
export async function generateImageVariants(input, destBaseDir, filename, options = {}) {
    const force = options.force === true
    const results = []

    for (const spec of VARIANTS) {
        const outDir = path.join(destBaseDir, spec.dir)
        const outPath = path.join(outDir, filename)

        if (!force && fs.existsSync(outPath)) {
            results.push({
                variant: spec.dir,
                path: outPath,
                bytes: fs.statSync(outPath).size,
                skipped: true,
            })
            continue
        }

        const buffer = await renderVariant(input, spec)
        await fs.promises.mkdir(outDir, { recursive: true })
        await fs.promises.writeFile(outPath, buffer)
        results.push({ variant: spec.dir, path: outPath, bytes: buffer.length, skipped: false })
    }

    return results
}

/** The three variant subfolder names. Useful for static-serving / path checks. */
export const VARIANT_DIR_NAMES = new Set(VARIANTS.map((spec) => spec.dir))

/** True if `dirName` is one of the generated variant subfolders ("sm" | "md" | "lg"). */
export function isVariantDir(dirName) {
    return VARIANT_DIR_NAMES.has(dirName)
}
