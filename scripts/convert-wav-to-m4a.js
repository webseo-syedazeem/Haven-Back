
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
Convert WAV soundscapes to M4A and create 60-second M4A previews.

Usage:
  node scripts/convert-wav-to-m4a.js [options]

Options:
  --dir <path>              Source folder.
                            Default: public/new_focus_soundscapes

  --bitrate <value>         Full M4A bitrate. Default: 192k

  --preview-bitrate <value> Preview bitrate. Default: 128k

  --preview-duration <sec>  Preview duration. Default: 60

  --delete-source           Delete WAV only after successful
                            full M4A and preview validation.

  --help                    Show help.

Examples:
  node scripts/convert-wav-to-m4a.js

  node scripts/convert-wav-to-m4a.js --bitrate 192k

  node scripts/convert-wav-to-m4a.js --preview-duration 60

  node scripts/convert-wav-to-m4a.js --delete-source

IMPORTANT:
  Previews are saved ONLY inside:
  public/new_focus_soundscapes/preview

  Production public/preview is never modified.
`);
  process.exit(0);
}

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const TARGET_DIR = path.resolve(
  PROJECT_ROOT,
  optionValue(
    '--dir',
    path.join('public', 'new_focus_soundscapes')
  )
);

const PREVIEW_DIR = path.join(TARGET_DIR, 'preview');

const AAC_BITRATE = optionValue('--bitrate', '192k');

const PREVIEW_BITRATE = optionValue(
  '--preview-bitrate',
  '192k'
);

const PREVIEW_DURATION = Number(
  optionValue('--preview-duration', '60')
);

const DELETE_SOURCE = args.includes('--delete-source');

// --------------------------------------------------
// VALIDATE CONFIGURATION
// --------------------------------------------------

for (const [label, value] of [
  ['--bitrate', AAC_BITRATE],
  ['--preview-bitrate', PREVIEW_BITRATE],
]) {
  if (
    !/^\d+k$/i.test(value) ||
    Number.parseInt(value, 10) < 8
  ) {
    throw new Error(
      `Invalid ${label}: ${value}. Example: 128k`
    );
  }
}

if (
  !Number.isInteger(PREVIEW_DURATION) ||
  PREVIEW_DURATION < 1
) {
  throw new Error(
    '--preview-duration must be a positive number.'
  );
}

if (!ffmpegPath) {
  throw new Error(
    'ffmpeg-static not found. Run npm install ffmpeg-static'
  );
}

// --------------------------------------------------
// FIND SOUNDSCAPES
// --------------------------------------------------

function findSoundscapes(directory) {
  const tracks = new Map();

  function walk(currentDir) {
    const entries = fs.readdirSync(
      currentDir,
      { withFileTypes: true }
    );

    for (const entry of entries) {
      const fullPath = path.join(
        currentDir,
        entry.name
      );

      if (entry.isDirectory()) {

        // Never scan generated previews.
        if (
          path.resolve(fullPath) ===
          path.resolve(PREVIEW_DIR)
        ) {
          continue;
        }

        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const extension = path.extname(
        entry.name
      ).toLowerCase();

      if (
        extension !== '.wav' &&
        extension !== '.m4a'
      ) {
        continue;
      }

      const relativeStem = path.relative(
        TARGET_DIR,
        path.join(
          path.dirname(fullPath),
          path.parse(entry.name).name
        )
      );

      const key = process.platform === 'win32'
        ? relativeStem.toLowerCase()
        : relativeStem;

      if (!tracks.has(key)) {
        tracks.set(key, { relativeStem });
      }

      if (extension === '.wav') {
        tracks.get(key).wavPath = fullPath;
      } else {
        tracks.get(key).m4aPath = fullPath;
      }
    }
  }

  walk(directory);

  return [...tracks.values()].sort(
    (a, b) =>
      a.relativeStem.localeCompare(b.relativeStem)
  );
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function runFfmpeg(ffmpegArgs) {
  try {
    return await execFileAsync(
      ffmpegPath,
      ffmpegArgs,
      {
        maxBuffer: 10 * 1024 * 1024,
      }
    );
  } catch (error) {
    throw new Error(
      (error.stderr || error.message || '').trim()
    );
  }
}

// --------------------------------------------------
// VALIDATE GENERATED AUDIO
// --------------------------------------------------

async function validateM4a(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Output file missing: ${filePath}`
    );
  }

  const stat = fs.statSync(filePath);

  if (stat.size <= 1024) {
    throw new Error(
      `Output file empty or incomplete: ${filePath}`
    );
  }

  // Verify FFmpeg can decode the beginning of the file.
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
// ENCODE FULL OR PREVIEW M4A
// --------------------------------------------------

async function encodeM4a(
  inputPath,
  outputPath,
  bitrate,
  durationSeconds = null
) {
  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  // Temporary output prevents incomplete final files.
  const tempPath =
    `${outputPath}.working-${process.pid}.m4a`;

  try {
    const ffmpegArgs = [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-y',

      '-i', inputPath,

      '-map', '0:a:0',
      '-vn',
    ];

    // Limit audio to first 60 seconds for previews.
    if (durationSeconds !== null) {
      ffmpegArgs.push(
        '-t',
        String(durationSeconds)
      );
    }

    ffmpegArgs.push(
      '-c:a', 'aac',
      '-b:a', bitrate,
      '-movflags', '+faststart',
      '-f', 'ipod',
      tempPath
    );

    await runFfmpeg(ffmpegArgs);

    const bytes = await validateM4a(tempPath);

    fs.renameSync(tempPath, outputPath);

    return bytes;

  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// --------------------------------------------------
// PROCESS EACH SOUNDSCAPE
// --------------------------------------------------

async function processSoundscape(track) {

  const masterPath =
    track.m4aPath ||
    path.join(
      TARGET_DIR,
      `${track.relativeStem}.m4a`
    );

  // Previews always go inside new_focus_soundscapes/preview.
  const previewPath = path.join(
    PREVIEW_DIR,
    `${track.relativeStem}.m4a`
  );

  const result = {
    newMaster: false,
    existingMaster: false,
    newPreview: false,
    existingPreview: false,
    deletedWav: false,
  };

  console.log(`\nProcessing: ${track.relativeStem}`);

  // ------------------------------------------------
  // STEP 1: CREATE FULL M4A
  // ------------------------------------------------

  if (fs.existsSync(masterPath)) {

    await validateM4a(masterPath);

    console.log(
      '  SKIP: Full M4A already exists.'
    );

    result.existingMaster = true;

  } else if (track.wavPath) {

    console.log(
      `  Converting full WAV to M4A (${AAC_BITRATE})...`
    );

    const bytes = await encodeM4a(
      track.wavPath,
      masterPath,
      AAC_BITRATE
    );

    console.log(
      `  Full M4A completed: ${formatBytes(bytes)}`
    );

    result.newMaster = true;

  } else {
    throw new Error(
      'No source WAV or full M4A available.'
    );
  }

  // ------------------------------------------------
  // STEP 2: CREATE 60-SECOND PREVIEW
  // ------------------------------------------------

  if (fs.existsSync(previewPath)) {

    await validateM4a(previewPath);

    console.log(
      '  SKIP: Preview M4A already exists.'
    );

    result.existingPreview = true;

  } else {

    console.log(
      `  Creating ${PREVIEW_DURATION}-second preview...`
    );

    const bytes = await encodeM4a(
      masterPath,
      previewPath,
      PREVIEW_BITRATE,
      PREVIEW_DURATION
    );

    console.log(
      `  Preview completed: ${formatBytes(bytes)}`
    );

    console.log(
      `  Preview saved: ${previewPath}`
    );

    result.newPreview = true;
  }

  // ------------------------------------------------
  // STEP 3: OPTIONAL SOURCE WAV DELETION
  // ------------------------------------------------

  if (
    DELETE_SOURCE &&
    track.wavPath &&
    fs.existsSync(track.wavPath)
  ) {

    // Full M4A and preview are both validated above.
    fs.unlinkSync(track.wavPath);

    console.log(
      '  Original WAV deleted after validation.'
    );

    result.deletedWav = true;
  }

  return result;
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {

  if (
    !fs.existsSync(TARGET_DIR) ||
    !fs.statSync(TARGET_DIR).isDirectory()
  ) {
    throw new Error(
      `Soundscape folder not found: ${TARGET_DIR}`
    );
  }

  console.log('\n==================================');
  console.log(' PASSAGE SOUNDSCAPE CONVERTER');
  console.log('==================================');

  console.log(`\nSource folder: ${TARGET_DIR}`);

  console.log(
    `Preview folder: ${PREVIEW_DIR}`
  );

  console.log(
    `Full M4A bitrate: ${AAC_BITRATE}`
  );

  console.log(
    `Preview bitrate: ${PREVIEW_BITRATE}`
  );

  console.log(
    `Preview duration: ${PREVIEW_DURATION} seconds`
  );

  console.log(
    `Delete WAV: ${DELETE_SOURCE ? 'YES' : 'NO'}`
  );

  // Create preview only in the selected local folder.
  fs.mkdirSync(
    PREVIEW_DIR,
    { recursive: true }
  );

  const tracks = findSoundscapes(TARGET_DIR);

  console.log(
    `\nFound ${tracks.length} soundscape(s).`
  );

  const summary = {
    newMaster: 0,
    existingMaster: 0,
    newPreview: 0,
    existingPreview: 0,
    deletedWav: 0,
    failed: 0,
  };

  const processedNames = [];

  for (const track of tracks) {

    try {
      const result = await processSoundscape(track);

      for (const key of Object.keys(result)) {
        summary[key] += Number(result[key]);
      }

      processedNames.push(track.relativeStem);

    } catch (error) {

      summary.failed++;

      console.error(
        `  FAILED: ${track.relativeStem}`
      );

      console.error(
        `  Reason: ${error.message}`
      );

      console.error(
        '  Source WAV retained. Other tracks will continue.'
      );
    }
  }

  // ------------------------------------------------
  // SUMMARY
  // ------------------------------------------------

  console.log('\n==================================');
  console.log(' CONVERSION SUMMARY');
  console.log('==================================');

  console.log(
    `New full M4A files: ${summary.newMaster}`
  );

  console.log(
    `Existing full M4A: ${summary.existingMaster}`
  );

  console.log(
    `New previews: ${summary.newPreview}`
  );

  console.log(
    `Existing previews: ${summary.existingPreview}`
  );

  console.log(
    `Deleted WAV files: ${summary.deletedWav}`
  );

  console.log(
    `Failed: ${summary.failed}`
  );

  console.log(
    `\nPreview location:\n${PREVIEW_DIR}`
  );

  console.log(
    '\nProduction public/preview was not modified.'
  );

  if (processedNames.length > 0) {
    console.log(
      `\nProcessed soundscapes (${processedNames.length}):`
    );
    for (const name of processedNames) {
      console.log(name);
    }
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  } else {
    console.log(
      '\nAll soundscapes processed successfully.'
    );
  }
}

main().catch((error) => {
  console.error(
    '\nFatal error:',
    error.message || error
  );

  process.exitCode = 1;
});
