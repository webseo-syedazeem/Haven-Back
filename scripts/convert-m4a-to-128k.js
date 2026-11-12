
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

  --check             Read-only scan for leftover "128k-working" files.
                      Lists their paths and expected original filenames;
                      does not convert, rename, or delete anything.

  --help              Show help.

Examples:
  # 1) Convert everything to 128k, keeping .orig backups:
  node scripts/convert-m4a-to-128k.js

  # 2) Later, once verified, delete the original backups:
  node scripts/convert-m4a-to-128k.js --delete-source

  # Check Sleep, Focus, Relax, and all other folders without changing files:
  node scripts/convert-m4a-to-128k.js --check

Notes:
  - A file that already has a "<name>.m4a.orig" backup is treated as already
    converted and is skipped (so re-running is safe/idempotent). To force a
    re-convert, delete that .orig file first.
  - Leftover ".128k-working-<pid>.m4a" files from an interrupted run are
    recovered automatically when complete, or removed and re-created when
    incomplete.
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
const CHECK_ONLY = args.includes('--check');

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

function findWorkingFiles(directory) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === 'preview' || entry.name.toLowerCase() === 'previews') {
          continue;
        }
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.includes(WORKING_MARKER)) {
        files.push(fullPath);
      }
    }
  }

  walk(directory);
  return files;
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

function parseProgressDuration(stdout) {
  const matches = [...stdout.matchAll(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)$/gm)];

  if (matches.length === 0) {
    throw new Error('Could not determine audio duration.');
  }

  const [, hours, minutes, seconds] = matches.at(-1);
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
}

// Read the whole container with stream copy. This is much faster than decoding,
// but still detects broken/truncated M4A containers and gives us the duration.
async function inspectM4a(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Output file missing: ${filePath}`);
  }

  const stat = fs.statSync(filePath);

  if (stat.size <= 1024) {
    throw new Error(`Output file empty or incomplete: ${filePath}`);
  }

  const { stdout } = await runFfmpeg([
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-xerror',
    '-progress', 'pipe:1',
    '-nostats',
    '-i', filePath,
    '-map', '0:a:0',
    '-c', 'copy',
    '-f', 'null',
    '-',
  ]);

  return { size: stat.size, duration: parseProgressDuration(stdout) };
}

// Verify the output is readable and has essentially the same duration as the
// source. A partially-written file must never be promoted just because its
// first few milliseconds happen to decode.
async function validateM4a(filePath, sourcePath) {
  const output = await inspectM4a(filePath);

  if (sourcePath) {
    const source = await inspectM4a(sourcePath);
    // AAC priming can move the reported duration by a few milliseconds. Half a
    // second is generous enough for that without accepting a meaningfully
    // truncated file (even for hour-long soundscapes).
    const tolerance = Math.max(0.5, source.duration * 0.0001);

    if (Math.abs(output.duration - source.duration) > tolerance) {
      throw new Error(
        `Incomplete duration: ${output.duration.toFixed(2)}s; expected ${source.duration.toFixed(2)}s.`
      );
    }
  }

  return output.size;
}

// --------------------------------------------------
// RECOVER FILES LEFT BY AN INTERRUPTED RUN
// --------------------------------------------------

async function recoverInterruptedConversions() {
  const workingFiles = findWorkingFiles(TARGET_DIR);

  if (workingFiles.length === 0) return { recovered: 0, discarded: 0, restored: 0 };

  console.log(`\nFound ${workingFiles.length} working file(s) left by an interrupted run.`);

  const grouped = new Map();

  for (const workingPath of workingFiles) {
    const markerIndex = workingPath.lastIndexOf(WORKING_MARKER);
    const suffix = workingPath.slice(markerIndex);

    if (!/^\.128k-working-\d+\.m4a$/i.test(suffix)) {
      console.warn(`  WARNING: unrecognized working filename; left untouched: ${path.relative(TARGET_DIR, workingPath)}`);
      continue;
    }

    const masterPath = workingPath.slice(0, markerIndex);
    const candidates = grouped.get(masterPath) || [];
    candidates.push(workingPath);
    grouped.set(masterPath, candidates);
  }

  const result = { recovered: 0, discarded: 0, restored: 0 };

  for (const [masterPath, candidates] of grouped) {
    const relative = path.relative(TARGET_DIR, masterPath);
    const backupPath = `${masterPath}${BACKUP_SUFFIX}`;
    const masterExists = fs.existsSync(masterPath);
    const backupExists = fs.existsSync(backupPath);

    // The final master and its backup both exist, so conversion had already
    // completed and only stale working files remain.
    if (masterExists && backupExists) {
      for (const candidate of candidates) {
        fs.unlinkSync(candidate);
        result.discarded++;
      }
      console.log(`  CLEANED stale working file(s): ${relative}`);
      continue;
    }

    const sourcePath = masterExists ? masterPath : (backupExists ? backupPath : null);

    if (!sourcePath) {
      console.warn(`  WARNING: no original or backup for ${relative}; working file(s) left untouched.`);
      continue;
    }

    // Prefer the newest complete candidate if several interrupted attempts exist.
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    let completeCandidate = null;

    for (const candidate of candidates) {
      try {
        await validateM4a(candidate, sourcePath);
        completeCandidate = candidate;
        break;
      } catch {
        // It is safe to discard only after every candidate has been considered.
      }
    }

    if (completeCandidate) {
      if (masterExists) {
        fs.renameSync(masterPath, backupPath);
      }

      try {
        fs.renameSync(completeCandidate, masterPath);
      } catch (error) {
        if (!masterExists && backupExists) {
          // Backup remains available; nothing to roll back.
        } else if (!fs.existsSync(masterPath) && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, masterPath);
        }
        throw error;
      }

      result.recovered++;
      console.log(`  RECOVERED completed conversion: ${relative}`);
    } else if (!masterExists && backupExists) {
      // Power failed after original -> backup but before temp -> original.
      fs.renameSync(backupPath, masterPath);
      result.restored++;
      console.log(`  RESTORED original; conversion will restart: ${relative}`);
    } else {
      console.log(`  DISCARDING incomplete conversion; will restart: ${relative}`);
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        result.discarded++;
      }
    }
  }

  return result;
}

// Read-only report for finding interrupted files across every soundscape
// category and nested folder. This deliberately performs no FFmpeg work and
// never renames or deletes anything.
function checkWorkingFiles() {
  const workingFiles = findWorkingFiles(TARGET_DIR);

  console.log('\n==================================');
  console.log(' WORKING FILE CHECK (READ-ONLY)');
  console.log('==================================');

  if (workingFiles.length === 0) {
    console.log('\nNo leftover 128k-working files found.');
    return;
  }

  console.log(`\nFound ${workingFiles.length} working file(s):\n`);

  for (const workingPath of workingFiles.sort((a, b) => a.localeCompare(b))) {
    const markerIndex = workingPath.lastIndexOf(WORKING_MARKER);
    const suffix = workingPath.slice(markerIndex);
    const workingRelative = path.relative(TARGET_DIR, workingPath);

    console.log(`WORKING: ${workingRelative}`);

    if (!/^\.128k-working-\d+\.m4a$/i.test(suffix)) {
      console.log('  Expected original: UNKNOWN (unrecognized working filename)');
      console.log('  Status: REVIEW MANUALLY\n');
      continue;
    }

    const masterPath = workingPath.slice(0, markerIndex);
    const backupPath = `${masterPath}${BACKUP_SUFFIX}`;
    const masterExists = fs.existsSync(masterPath);
    const backupExists = fs.existsSync(backupPath);

    console.log(`  Expected original: ${path.relative(TARGET_DIR, masterPath)}`);
    console.log(`  Normal .m4a exists: ${masterExists ? 'YES' : 'NO'}`);
    console.log(`  .orig backup exists: ${backupExists ? 'YES' : 'NO'}`);

    if (!masterExists && !backupExists) {
      console.log('  Status: RE-UPLOAD ORIGINAL');
    } else if (masterExists) {
      console.log('  Status: NORMAL .m4a EXISTS; verify it before re-uploading');
    } else {
      console.log('  Status: .orig EXISTS; interrupted during final rename');
    }

    console.log('');
  }

  console.log('No files were changed (--check is read-only).');
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

    const newSize = await validateM4a(tempPath, filePath);

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

  if (CHECK_ONLY) {
    checkWorkingFiles();
    return;
  }

  const recovery = await recoverInterruptedConversions();

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
  console.log(`Interrupted conversions recovered: ${recovery.recovered}`);
  console.log(`Incomplete/stale working files removed: ${recovery.discarded}`);

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
