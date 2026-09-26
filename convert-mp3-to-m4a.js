import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = __dirname;
const TARGET_DIRS = [
  path.join(PROJECT_ROOT, 'public', 'soundscapes'),
  path.join(PROJECT_ROOT, 'public', 'previews'),
];

// Ambient/nature soundscapes sound great at 192k AAC — near-transparent quality,
// much smaller than the original MP3s. Lower to '128k' if file size matters more.
const AAC_BITRATE = process.argv.includes('--bitrate')
  ? process.argv[process.argv.indexOf('--bitrate') + 1]
  : '192k';

function findMp3Files(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findMp3Files(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
      results.push(fullPath);
    }
  }
  return results;
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function convertFile(mp3Path) {
  const m4aPath = mp3Path.replace(/\.mp3$/i, '.m4a');

  if (fs.existsSync(m4aPath)) {
    console.log(`  SKIP (already converted): ${path.basename(m4aPath)}`);
    return { mp3Path, m4aPath, skipped: true };
  }

  const beforeSize = fs.statSync(mp3Path).size;
  console.log(`  Converting: ${path.basename(mp3Path)} (${formatBytes(beforeSize)}) ...`);

  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-i', mp3Path,
        '-c:a', 'aac',
        '-b:a', AAC_BITRATE,
        '-movflags', '+faststart',
        m4aPath,
      ],
      { maxBuffer: 1024 * 1024 * 50 }
    );
  } catch (err) {
    console.error(`  FAILED: ${path.basename(mp3Path)}`);
    console.error(err.stderr || err.message);
    if (fs.existsSync(m4aPath)) fs.unlinkSync(m4aPath); // remove partial/broken output
    return { mp3Path, m4aPath, failed: true };
  }

  const afterSize = fs.statSync(m4aPath).size;
  console.log(`  Done: ${path.basename(m4aPath)} (${formatBytes(afterSize)})`);
  return { mp3Path, m4aPath, beforeSize, afterSize, converted: true };
}

async function main() {
  console.log('Passage audio converter — MP3 to seek-safe M4A (AAC + faststart)');
  console.log(`Using ffmpeg: ${ffmpegPath}`);
  console.log(`Bitrate: ${AAC_BITRATE}\n`);

  let allMp3s = [];
  for (const dir of TARGET_DIRS) {
    const found = findMp3Files(dir);
    console.log(`Found ${found.length} .mp3 file(s) in ${path.relative(PROJECT_ROOT, dir)}`);
    allMp3s = allMp3s.concat(found);
  }

  if (allMp3s.length === 0) {
    console.log('\nNo .mp3 files found. Nothing to do.');
    return;
  }

  console.log(`\nConverting ${allMp3s.length} file(s)...\n`);

  const results = [];
  for (const mp3Path of allMp3s) {
    results.push(await convertFile(mp3Path));
  }

  const converted = results.filter((r) => r.converted);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => r.failed);

  console.log('\n========== SUMMARY ==========');
  console.log(`Converted: ${converted.length}`);
  console.log(`Skipped (already done): ${skipped.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed files (left untouched — check these manually):');
    failed.forEach((r) => console.log(`  - ${r.mp3Path}`));
  }

  if (converted.length > 0) {
    console.log(
      '\nOriginal .mp3 files were NOT deleted — test playback in the app first, then remove them manually once confirmed.'
    );
    console.log('\n---------------------------------------------------------------');
    console.log('NEXT STEP: run this SQL in the Supabase SQL editor to point the');
    console.log('database at the new .m4a files:');
    console.log('---------------------------------------------------------------\n');
    console.log(`update public.soundscapes set file_url = replace(file_url, '.mp3', '.m4a') where file_url like '%.mp3';`);
    console.log(`update public.soundscapes set preview_url = replace(preview_url, '.mp3', '.m4a') where preview_url like '%.mp3';`);
    console.log('\nThen clear the Redis cache:');
    console.log(`  redis-cli -a 'YOUR_REDIS_PASSWORD' FLUSHALL`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});