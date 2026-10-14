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
Make soundscape M4A files exactly 1 hour long.

The soundscape engineer's deliveries are sometimes a few seconds to a
few minutes longer than the intended 1-hour runtime, and occasionally
a couple of seconds SHORT. This fixes both directions:

  - Too long  -> losslessly trims the excess off the END (stream copy,
                 no re-encode, no quality loss).
  - Too short -> very slightly time-stretches the whole file so it
                 reaches exactly 1 hour. For a shortfall of a few
                 seconds out of 3600 (well under 1%), this is
                 inaudible - it is the same trick used to fix small
                 sync drifts in video/audio post-production. Large
                 shortfalls are refused rather than stretched audibly
                 (see --max-stretch-seconds).

Usage:
  node scripts/trim-soundscapes-to-1hour.js [options]

Options:
  --dir <path>        Folder to scan recursively.
                       Default: scans all of
                         public/soundscapes/Sleep
                         public/soundscapes/Focus
                         public/soundscapes/Relax

  --max-seconds <n>    Target duration in seconds. Default: 3600 (1 hour)

  --tolerance <n>      Files within this many seconds of the target are
                       left alone (already effectively exact). Default: 0.1

  --max-stretch-seconds <n>
                       Refuse to stretch a short file by more than this many
                       seconds (stretching too much would be audible).
                       Default: 15

  --backup-dir <path>  Where untouched originals are copied before changes.
                       Default: public/soundscapes/_pre_trim_originals

  --no-backup          Skip backing up originals before overwriting.

  --dry-run            Report what would change without touching files.

  --help               Show help.

Examples:
  node scripts/trim-soundscapes-to-1hour.js --dry-run

  node scripts/trim-soundscapes-to-1hour.js

  node scripts/trim-soundscapes-to-1hour.js --dir public/soundscapes/Focus
`);
  process.exit(0);
}

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const DIR_OPTION = optionValue('--dir', null);

const TARGET_DIRS = DIR_OPTION
  ? [path.resolve(PROJECT_ROOT, DIR_OPTION)]
  : [
      path.resolve(PROJECT_ROOT, 'public', 'soundscapes', 'Sleep'),
      path.resolve(PROJECT_ROOT, 'public', 'soundscapes', 'Focus'),
      path.resolve(PROJECT_ROOT, 'public', 'soundscapes', 'Relax'),
    ];

const MAX_SECONDS = Number(optionValue('--max-seconds', '3600'));

const TOLERANCE_SECONDS = Number(optionValue('--tolerance', '0.1'));

const MAX_STRETCH_SECONDS = Number(optionValue('--max-stretch-seconds', '15'));

const BACKUP_DIR = path.resolve(
  PROJECT_ROOT,
  optionValue('--backup-dir', path.join('public', 'soundscapes', '_pre_trim_originals'))
);

const NO_BACKUP = args.includes('--no-backup');

const DRY_RUN = args.includes('--dry-run');

if (!Number.isFinite(MAX_SECONDS) || MAX_SECONDS <= 0) {
  throw new Error('--max-seconds must be a positive number.');
}

if (!Number.isFinite(TOLERANCE_SECONDS) || TOLERANCE_SECONDS < 0) {
  throw new Error('--tolerance must be zero or a positive number.');
}

if (!Number.isFinite(MAX_STRETCH_SECONDS) || MAX_STRETCH_SECONDS <= 0) {
  throw new Error('--max-stretch-seconds must be a positive number.');
}

if (!ffmpegPath) {
  throw new Error('ffmpeg-static not found. Run npm install ffmpeg-static');
}

// --------------------------------------------------
// FIND AUDIO FILES
// --------------------------------------------------

function findAudioFiles(directory) {
  const files = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Never touch backup folders.
        if (path.resolve(fullPath) === path.resolve(BACKUP_DIR)) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (extension !== '.m4a') continue;

      files.push(fullPath);
    }
  }

  walk(directory);

  return files.sort((a, b) => a.localeCompare(b));
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatSeconds(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);
  return `${h}h ${m}m ${s}s`;
}

async function runFfmpeg(ffmpegArgs) {
  try {
    return await execFileAsync(ffmpegPath, ffmpegArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    // execFile rejects on ffmpeg's non-zero exit even when stderr holds
    // the info we actually want (probing with no output file errors by design).
    return { stdout: '', stderr: error.stderr || error.message || '' };
  }
}

async function probeDurationSeconds(filePath) {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', filePath]);

  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

async function probeAudioBitrateKbps(filePath) {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', filePath]);

  // Prefer the per-stream bitrate (closer to the actual AAC encode rate)
  // over the container-level bitrate on the "Duration:" line.
  const streamMatch = stderr.match(/Stream #0:0.*?(\d+)\s*kb\/s/);
  if (streamMatch) return Number(streamMatch[1]);

  const containerMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (containerMatch) return Number(containerMatch[1]);

  return null;
}

function backupOriginal(filePath) {
  if (NO_BACKUP) return;

  const relativePath = TARGET_DIRS
    .map((dir) => (filePath.startsWith(dir) ? path.relative(dir, filePath) : null))
    .find((rel) => rel !== null);

  const backupPath = path.join(BACKUP_DIR, relativePath || path.basename(filePath));

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
  }
}

// --------------------------------------------------
// TRIM ONE FILE
// --------------------------------------------------

async function trimFile(filePath, durationSeconds) {
  const tempPath = `${filePath}.working-${process.pid}.m4a`;

  try {
    await runFfmpeg([
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-y',

      '-i', filePath,

      '-map', '0:a:0',
      '-vn',

      '-t', String(MAX_SECONDS),

      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'ipod',
      tempPath,
    ]);

    if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size <= 1024) {
      throw new Error('Trimmed output missing or empty.');
    }

    const trimmedDuration = await probeDurationSeconds(tempPath);

    if (
      trimmedDuration === null ||
      trimmedDuration > MAX_SECONDS + TOLERANCE_SECONDS ||
      trimmedDuration < MAX_SECONDS - TOLERANCE_SECONDS
    ) {
      throw new Error(
        `Trimmed duration looks wrong: ${trimmedDuration === null ? 'unreadable' : formatSeconds(trimmedDuration)}`
      );
    }

    backupOriginal(filePath);

    fs.renameSync(tempPath, filePath);

    return trimmedDuration;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// --------------------------------------------------
// STRETCH ONE SHORT FILE UP TO TARGET LENGTH
// --------------------------------------------------
//
// A file a few seconds short of 1 hour can't be fixed by trimming -
// there's nothing to cut. Padding with silence would be audible (a
// dead gap before the loop restarts), so instead the whole file is
// time-stretched by a tiny ratio with ffmpeg's atempo filter. For a
// shortfall of a few seconds out of 3600 (under ~0.5%), the pitch/tempo
// change is inaudible. Shortfalls bigger than --max-stretch-seconds are
// refused rather than risk an audible result - that needs a fresh file
// from the audio engineer, not this script.

async function stretchFile(filePath, durationSeconds) {
  const shortfall = MAX_SECONDS - durationSeconds;

  if (shortfall > MAX_STRETCH_SECONDS) {
    throw new Error(
      `Short by ${shortfall.toFixed(2)}s, which is more than --max-stretch-seconds ` +
      `(${MAX_STRETCH_SECONDS}s). Refusing to stretch - needs a new file from the engineer.`
    );
  }

  const tempPath = `${filePath}.working-${process.pid}.m4a`;

  try {
    const bitrateKbps = (await probeAudioBitrateKbps(filePath)) || 192;
    const atempoFactor = durationSeconds / MAX_SECONDS;

    await runFfmpeg([
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-y',

      '-i', filePath,

      '-map', '0:a:0',
      '-vn',

      '-filter:a', `atempo=${atempoFactor.toFixed(8)}`,

      '-c:a', 'aac',
      '-b:a', `${bitrateKbps}k`,
      '-movflags', '+faststart',
      '-f', 'ipod',
      tempPath,
    ]);

    if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size <= 1024) {
      throw new Error('Stretched output missing or empty.');
    }

    const stretchedDuration = await probeDurationSeconds(tempPath);

    if (
      stretchedDuration === null ||
      Math.abs(stretchedDuration - MAX_SECONDS) > Math.max(TOLERANCE_SECONDS, 1)
    ) {
      throw new Error(
        `Stretched duration looks wrong: ${stretchedDuration === null ? 'unreadable' : formatSeconds(stretchedDuration)}`
      );
    }

    backupOriginal(filePath);

    fs.renameSync(tempPath, filePath);

    return stretchedDuration;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  console.log('\n==================================');
  console.log(' PASSAGE SOUNDSCAPE 1-HOUR TRIMMER');
  console.log('==================================');

  console.log(`\nTarget duration: ${MAX_SECONDS} seconds (${formatSeconds(MAX_SECONDS)})`);
  console.log(`Tolerance: ${TOLERANCE_SECONDS} second(s)`);
  console.log(`Backup originals: ${NO_BACKUP ? 'NO' : 'YES'} ${NO_BACKUP ? '' : `-> ${BACKUP_DIR}`}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no files will be changed)' : 'LIVE'}`);

  let allFiles = [];
  for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`\nSkipping missing folder: ${dir}`);
      continue;
    }
    const found = findAudioFiles(dir);
    console.log(`\nFound ${found.length} .m4a file(s) in ${path.relative(PROJECT_ROOT, dir)}`);
    allFiles = allFiles.concat(found);
  }

  if (allFiles.length === 0) {
    console.log('\nNo .m4a files found. Nothing to do.');
    return;
  }

  const summary = {
    trimmed: 0,
    stretched: 0,
    alreadyOk: 0,
    failed: 0,
    secondsRemoved: 0,
    secondsAdded: 0,
  };

  for (const filePath of allFiles) {
    const label = path.relative(PROJECT_ROOT, filePath);

    let duration;
    try {
      duration = await probeDurationSeconds(filePath);
    } catch (error) {
      summary.failed++;
      console.error(`\nFAILED to read duration: ${label}`);
      console.error(`  Reason: ${error.message}`);
      continue;
    }

    if (duration === null) {
      summary.failed++;
      console.error(`\nFAILED to read duration: ${label}`);
      continue;
    }

    const diff = duration - MAX_SECONDS;

    if (Math.abs(diff) <= TOLERANCE_SECONDS) {
      summary.alreadyOk++;
      continue;
    }

    console.log(`\n${label}`);

    if (diff > 0) {
      // Too long: lossless trim.
      console.log(`  Current: ${formatSeconds(duration)}  (over by ${diff.toFixed(2)}s)`);

      if (DRY_RUN) {
        console.log(`  Would trim to: ${formatSeconds(MAX_SECONDS)}`);
        summary.trimmed++;
        summary.secondsRemoved += diff;
        continue;
      }

      try {
        const trimmedDuration = await trimFile(filePath, duration);
        console.log(`  Trimmed to: ${formatSeconds(trimmedDuration)}`);
        summary.trimmed++;
        summary.secondsRemoved += diff;
      } catch (error) {
        summary.failed++;
        console.error(`  FAILED: ${error.message}`);
        console.error('  Original file left untouched.');
      }
    } else {
      // Too short: tiny time-stretch, since there's nothing to cut.
      const shortfall = -diff;
      console.log(`  Current: ${formatSeconds(duration)}  (short by ${shortfall.toFixed(2)}s)`);

      if (DRY_RUN) {
        if (shortfall > MAX_STRETCH_SECONDS) {
          console.log(`  Would SKIP: shortfall exceeds --max-stretch-seconds (${MAX_STRETCH_SECONDS}s). Needs a new file.`);
          summary.failed++;
        } else {
          console.log(`  Would stretch (atempo ${(duration / MAX_SECONDS).toFixed(6)}) to: ${formatSeconds(MAX_SECONDS)}`);
          summary.stretched++;
          summary.secondsAdded += shortfall;
        }
        continue;
      }

      try {
        const stretchedDuration = await stretchFile(filePath, duration);
        console.log(`  Stretched to: ${formatSeconds(stretchedDuration)}`);
        summary.stretched++;
        summary.secondsAdded += shortfall;
      } catch (error) {
        summary.failed++;
        console.error(`  FAILED: ${error.message}`);
        console.error('  Original file left untouched.');
      }
    }
  }

  // ------------------------------------------------
  // SUMMARY
  // ------------------------------------------------

  console.log('\n==================================');
  console.log(' SUMMARY');
  console.log('==================================');
  console.log(`Total files scanned: ${allFiles.length}`);
  console.log(`${DRY_RUN ? 'Would trim' : 'Trimmed'} (too long): ${summary.trimmed}`);
  console.log(`${DRY_RUN ? 'Would stretch' : 'Stretched'} (too short): ${summary.stretched}`);
  console.log(`Already exactly 1 hour: ${summary.alreadyOk}`);
  console.log(`Failed / skipped: ${summary.failed}`);
  console.log(`Total excess removed: ${formatSeconds(summary.secondsRemoved)}`);
  console.log(`Total shortfall stretched: ${formatSeconds(summary.secondsAdded)}`);

  const changed = summary.trimmed + summary.stretched;

  if (!DRY_RUN && !NO_BACKUP && changed > 0) {
    console.log(`\nOriginals backed up under:\n${BACKUP_DIR}`);
  }

  if (DRY_RUN && changed > 0) {
    console.log('\nThis was a dry run. Re-run without --dry-run to apply.');
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nFatal error:', error.message || error);
  process.exitCode = 1;
});
