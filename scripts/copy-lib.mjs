// tsc only emits compiled .ts files into dist/. lib/imageVariants.js is plain ESM JS (shared,
// unbuilt, imported both by scripts/generate-image-variants.js directly and, after build, by
// dist/Controller/AdminImageUpload.js) and has no .ts source, so it never gets emitted on its
// own. Copy it into dist/lib/ after every build so the compiled controller's relative import
// `../lib/imageVariants.js` resolves at runtime exactly like it does in dev (ts-node, uncompiled).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(projectRoot, "lib")
const destination = path.join(projectRoot, "dist", "lib")

fs.cpSync(source, destination, { recursive: true })
console.log(`Copied ${path.relative(projectRoot, source)} -> ${path.relative(projectRoot, destination)}`)
