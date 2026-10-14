#!/usr/bin/env node
//
// Generate sm/ (480w), md/ (800w) and lg/ (original width) WebP variants for every image file
// directly inside a source folder (default: public/passage_soundscape_images_webp).
//
// Re-runnable / idempotent: existing variant files are left alone unless --force is passed.
// Never touches, moves, or deletes the original files. Never descends into sm/, md/ or lg/
// subfolders of the source directory (so re-running the script never reprocesses variants
// as if they were new originals).
//
// Usage:
//   node scripts/generate-image-variants.js [--dir <path>] [--force]
//
// Options:
//   --dir <path>   Source folder to scan (non-recursive). Default:
//                  public/passage_soundscape_images_webp (relative to this project's root).
//   --force        Regenerate a variant even if it already exists on disk.
//   --help         Show this message.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateImageVariants, isVariantDir, VARIANTS } from "../lib/imageVariants.js"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SOURCE_DIR = path.join(PROJECT_ROOT, "public", "passage_soundscape_images_webp")

function parseArgs(argv) {
    const args = { dir: DEFAULT_SOURCE_DIR, force: false, help: false }

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]
        if (arg === "--dir") {
            const value = argv[i + 1]
            if (!value || value.startsWith("--")) {
                throw new Error("--dir requires a path value")
            }
            args.dir = path.resolve(value)
            i += 1
        } else if (arg === "--force") {
            args.force = true
        } else if (arg === "--help" || arg === "-h") {
            args.help = true
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }

    return args
}

function printHelp() {
    console.log(`
Generate sm/md/lg WebP cover-image variants.

Usage:
  node scripts/generate-image-variants.js [options]

Options:
  --dir <path>   Source folder to scan (non-recursive).
                 Default: ${path.relative(PROJECT_ROOT, DEFAULT_SOURCE_DIR)}
  --force        Regenerate variants even if they already exist on disk.
  --help         Show this message.

Variants produced (alongside the originals, never modifying them):
${VARIANTS.map((v) => `  ${v.dir}/  width=${v.width ?? "original (no upscale)"}  quality=${v.quality}`).join("\n")}
`)
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function listSourceFiles(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        if (entry.isDirectory()) {
            // Never descend into sm/, md/, lg/ (or any other subfolder) — non-recursive by design.
            continue
        }
        if (!entry.isFile()) continue
        if (isVariantDir(entry.name)) continue // defensive, in case a file is literally named "sm" etc.

        const ext = path.extname(entry.name).toLowerCase()
        if (ext !== ".webp") continue // WebP only — no AVIF/JPEG/PNG format changes.

        files.push(entry.name)
    }

    return files.sort()
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        printHelp()
        return
    }

    if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) {
        console.error(`Source directory does not exist: ${args.dir}`)
        process.exitCode = 1
        return
    }

    const files = await listSourceFiles(args.dir)

    if (files.length === 0) {
        console.log(`No .webp files found directly inside ${args.dir}`)
        return
    }

    console.log(`Scanning ${files.length} file(s) in ${args.dir}${args.force ? " (--force: regenerating all variants)" : ""}\n`)

    const rows = []
    let totalOriginal = 0
    let totalVariants = 0

    for (const filename of files) {
        const sourcePath = path.join(args.dir, filename)
        const originalBytes = fs.statSync(sourcePath).size
        totalOriginal += originalBytes

        const results = await generateImageVariants(sourcePath, args.dir, filename, { force: args.force })
        const byVariant = Object.fromEntries(results.map((r) => [r.variant, r]))

        const variantBytesSum = results.reduce((sum, r) => sum + r.bytes, 0)
        totalVariants += variantBytesSum

        rows.push({
            filename,
            original: originalBytes,
            sm: byVariant.sm?.bytes ?? 0,
            md: byVariant.md?.bytes ?? 0,
            lg: byVariant.lg?.bytes ?? 0,
            skipped: results.every((r) => r.skipped),
        })

        const flags = results.map((r) => (r.skipped ? `${r.variant}=skip` : r.variant)).join(" ")
        console.log(`  ${filename}  (${formatBytes(originalBytes)})  ->  ${flags}`)
    }

    // --- Summary table ---
    console.log("\nFile                                                      Original      sm          md          lg")
    console.log("-".repeat(110))
    for (const row of rows) {
        const name = row.filename.length > 54 ? `${row.filename.slice(0, 51)}...` : row.filename
        console.log(
            `${name.padEnd(58)}${formatBytes(row.original).padEnd(12)}${formatBytes(row.sm).padEnd(12)}${formatBytes(row.md).padEnd(12)}${formatBytes(row.lg)}`
        )
    }

    const savedBytes = totalOriginal * VARIANTS.length - totalVariants // rough: vs. serving original 3x
    console.log("-".repeat(110))
    console.log(`Total original bytes (x${VARIANTS.length} if every size served the master): ${formatBytes(totalOriginal * VARIANTS.length)}`)
    console.log(`Total sm+md+lg bytes written/kept: ${formatBytes(totalVariants)}`)
    console.log(`Approx. bytes saved vs. always serving the original at every size: ${formatBytes(savedBytes)}`)

    let largestLg = rows[0]
    let smallestSm = rows[0]
    for (const row of rows) {
        if (row.lg > largestLg.lg) largestLg = row
        if (row.sm > 0 && (smallestSm.sm === 0 || row.sm < smallestSm.sm)) smallestSm = row
    }
    console.log(`\nLargest resulting variant: ${largestLg.filename} (lg = ${formatBytes(largestLg.lg)})`)
    console.log(`Smallest resulting variant: ${smallestSm.filename} (sm = ${formatBytes(smallestSm.sm)})`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
