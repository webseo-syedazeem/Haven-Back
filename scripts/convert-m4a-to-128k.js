
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;

  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

if (args.includes('--help')) {
  console.log(`
Re-encode existing M4A soundscapes to a lower bitrate (default 128k), in place,
with +faststart preserved. Smaller files = faster loading and less mobile data.

The original of each file is kept as "<name>.m4a.orig" (a backup) until you run
again with --delete-source, which removes those backups. Because of that backup,
this script is safe to run and verify before anything is permanently removed.

Usage:
  node scripts/convert-m4a-to-128k.js [options]

Options:
  --dir <path>        Source folder (recurses into subfolders).
                      Default: public/soundscapes

  --bitrate <value>   Target bitrate. Default: 128k

  --delete-source     Delete the "<name>.m4a.orig" backups (the original
                      higher-bitrate files). Run this only after you have
                      verified the 128k files are good.

  --help              Show help.

Examples:
  # 1) Convert everything to 128k, keeping .orig backups:
  node scripts/convert-m4a-to-128k.js

  # 2) Later, once verified, delete the original backups:
  node scripts/convert-m4a-to-128k.js --delete-source

Notes:
  - A file that already has a "<name>.m4a.orig" backup is treated as already
    converted and is skipped (so re-running is safe/idempotent). To force a
    re-convert, delete that .orig file first.
  - The "preview" folders are skipped.
`);
  process.exit(0);
}

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const TARGET_DIR = path.resolve(
  PROJECT_ROOT,
  optionValue('--dir', path.join('public', 'soundscapes'))
);

const AAC_BITRATE = optionValue('--bitrate', '128k');

const DELETE_SOURCE = args.includes('--delete-source');

const BACKUP_SUFFIX = '.orig';
const WORKING_MARKER = '.128k-working';

// --------------------------------------------------
// VALIDATE CONFIGURATION
// --------------------------------------------------

if (!/^\d+k$/i.test(AAC_BITRATE) || Number.parseInt(AAC_BITRATE, 10) < 8) {
  throw new Error(`Invalid --bitrate: ${AAC_BITRATE}. Example: 128k`);
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static not found. Run npm install ffmpeg-static');
}

// --------------------------------------------------
// FIND M4A FILES
// --------------------------------------------------

function findM4aFiles(directory) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Never descend into preview folders.
        if (entry.name.toLowerCase() === 'preview' || entry.name.toLowerCase() === 'previews') {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      // Only real .m4a masters — never the transient working files or backups.
      if (path.extname(entry.name).toLowerCase() !== '.m4a') continue;
      if (entry.name.includes(WORKING_MARKER)) continue;

      files.push(fullPath);
    }
  }

  walk(directory);

  return files.sort((a, b) => a.localeCompare(b));
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function runFfmpeg(ffmpegArgs) {
  try {
    return await execFileAsync(ffmpegPath, ffmpegArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error((error.stderr || error.message || '').trim());
  }
}

// Verify the output exists, is non-trivial, and decodes.
async function validateM4a(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Output file missing: ${filePath}`);
  }

  const stat = fs.statSync(filePath);

  if (stat.size <= 1024) {
    throw new Error(`Output file empty or incomplete: ${filePath}`);
  }

  await runFfmpeg([
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-xerror',
    '-i', filePath,
    '-map', '0:a:0',
    '-t', '0.25',
    '-f', 'null',
    '-',
  ]);

  return stat.size;
}

// --------------------------------------------------
// RE-ENCODE ONE FILE IN PLACE (keeping a .orig backup)
// --------------------------------------------------

async function reencodeInPlace(filePath) {
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;
  const tempPath = `${filePath}${WORKING_MARKER}-${process.pid}.m4a`;

  try {
    await runFfmpeg([
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', filePath,
      '-map', '0:a:0',
      '-vn',
      '-c:a', 'aac',
      '-b:a', AAC_BITRATE,
      '-movflags', '+faststart',
      '-f', 'ipod',
      tempPath,
    ]);

    const newSize = await validateM4a(tempPath);

    // Atomic-ish swap: keep the original as a backup, move the new file in.
    fs.renameSync(filePath, backupPath);
    fs.renameSync(tempPath, filePath);

    return { newSize, backupPath };
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// --------------------------------------------------
// PROCESS EACH FILE
// --------------------------------------------------

async function processFile(filePath) {
  const relative = path.relative(TARGET_DIR, filePath);
  const backupPath = `${filePath}${BACKUP_SUFFIX}`;

  // Already converted earlier (a backup exists) → do not re-encode.
  if (fs.existsSync(backupPath)) {
    if (DELETE_SOURCE) {
      const origSize = fs.statSync(backupPath).size;
      fs.unlinkSync(backupPath);
      console.log(`  DELETED original backup (${formatBytes(origSize)}): ${relative}`);
      return { converted: false, skipped: false, deletedBackup: true };
    }

    console.log(`  SKIP (already 128k, backup present): ${relative}`);
    return { converted: false, skipped: true, deletedBackup: false };
  }

  const beforeSize = fs.statSync(filePath).size;
  console.log(`\nConverting: ${relative} (${formatBytes(beforeSize)}) -> ${AAC_BITRATE}`);

  const { newSize } = await reencodeInPlace(filePath);
  console.log(`  Done: ${formatBytes(beforeSize)} -> ${formatBytes(newSize)}`);

  if (DELETE_SOURCE) {
    // One-shot mode: remove the just-created backup (the original).
    fs.unlinkSync(backupPath);
    console.log('  Original backup deleted (--delete-source).');
    return { converted: true, skipped: false, deletedBackup: true };
  }

  console.log(`  Original kept as backup: ${path.relative(TARGET_DIR, backupPath)}`);
  return { converted: true, skipped: false, deletedBackup: false };
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  if (!fs.existsSync(TARGET_DIR) || !fs.statSync(TARGET_DIR).isDirectory()) {
    throw new Error(`Soundscape folder not found: ${TARGET_DIR}`);
  }

  console.log('\n==================================');
  console.log(' M4A -> 128k RE-ENCODER');
  console.log('==================================');
  console.log(`\nSource folder: ${TARGET_DIR}`);
  console.log(`Target bitrate: ${AAC_BITRATE}`);
  console.log(`Delete original backups: ${DELETE_SOURCE ? 'YES' : 'NO'}`);

  const files = findM4aFiles(TARGET_DIR);
  console.log(`\nFound ${files.length} M4A file(s).`);

  const summary = {
    converted: 0,
    skipped: 0,
    deletedBackup: 0,
    failed: 0,
  };

  for (const filePath of files) {
    try {
      const result = await processFile(filePath);
      summary.converted += Number(result.converted);
      summary.skipped += Number(result.skipped);
      summary.deletedBackup += Number(result.deletedBackup);
    } catch (error) {
      summary.failed++;
      console.error(`  FAILED: ${path.relative(TARGET_DIR, filePath)}`);
      console.error(`  Reason: ${error.message}`);
      console.error('  Original left untouched. Other files will continue.');
    }
  }

  console.log('\n==================================');
  console.log(' SUMMARY');
  console.log('==================================');
  console.log(`Converted to ${AAC_BITRATE}: ${summary.converted}`);
  console.log(`Skipped (already done): ${summary.skipped}`);
  console.log(`Original backups deleted: ${summary.deletedBackup}`);
  console.log(`Failed: ${summary.failed}`);

  if (!DELETE_SOURCE && summary.converted > 0) {
    console.log('\nOriginals saved as "<name>.m4a.orig". Verify the 128k files,');
    console.log('then run again with --delete-source to remove those backups.');
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('\nAll done.');
  }
}

main().catch((error) => {
  console.error('\nFatal error:', error.message || error);
  process.exitCode = 1;
});
