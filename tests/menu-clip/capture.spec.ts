import { expect, test } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  compressLoop,
  loopBed,
  lowPassLoop,
  mixLoop,
  normalize,
  rmsDb,
  wavFile,
  type Placement,
} from '../../scripts/menu-clip-audio';
import type { ClipSound } from '../../src/audio/clipSounds';
import type { SoundId } from '../../src/audio/sounds';
import { MENU_CLIP } from '../../src/data/menuClip';
import { MENU_CLIP_MIX } from './mix';

// Records the menu clip (#568): the real game with ?clip=1 steps it a video frame at a time, each frame is
// screenshotted straight into ffmpeg, and the muffled battle track is mixed from the scene's own sound events. Writes
// the videos and still to assets/menu-clip/, and the evidence (first and last frames, the track) to menu-clip-evidence/.

const OUT = 'assets/menu-clip';
// Not test-results/: Playwright empties that at the start of every run, e2e included.
const EVIDENCE = 'menu-clip-evidence';
const RATE = 48_000;
const BUDGET_BYTES = 3.2 * 1024 * 1024;

/** A sound file decoded to mono float samples at `RATE`. */
const decode = (file: string): Float32Array => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
};

const ffmpeg = (args: readonly string[]) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

/**
 * The clip's sound timeline. The maps load through Vite (their Tiled files are `?raw` imports), as in
 * scripts/scenario.ts.
 */
async function clipSounds(): Promise<ClipSound[]> {
  const { runnerImport } = await import('vite');
  const load = async <T>(path: string) =>
    (await runnerImport<T>(join(process.cwd(), path), { configFile: false, logLevel: 'error' })).module;
  const { mapById } = await load<typeof import('../../src/data/maps')>('src/data/maps.ts');
  const { menuClipSounds } = await load<typeof import('../../src/audio/clipSounds')>('src/audio/clipSounds.ts');
  const entry = mapById(MENU_CLIP.mapId);
  return menuClipSounds(MENU_CLIP, entry.data, entry.defender);
}

/** The muffled battle loop, exactly one loop long, as a WAV; returns its samples too. */
function mixTrack(file: string, sounds: readonly ClipSound[]): Float32Array {
  const length = Math.round((MENU_CLIP.loopMs / 1000) * RATE);
  const cache = new Map<SoundId, Float32Array>();
  const samplesOf = (id: SoundId) => {
    if (!cache.has(id)) cache.set(id, decode(`assets/weapon-sounds/${id}.ogg`));
    return cache.get(id)!;
  };
  const placements: Placement[] = sounds.map(({ ms, id, volume }) => ({
    samples: samplesOf(id),
    at: Math.round((ms / 1000) * RATE),
    gain: volume,
  }));
  const events = mixLoop(length, placements);
  // The battlefield ambience under it: the combat bed is itself a loop, so two of it run on past the clip's loop
  // point, and that overhang is crossfaded into the start.
  const bedOnce = decode(MENU_CLIP_MIX.bed);
  const bedRun = new Float32Array(bedOnce.length * 2);
  bedRun.set(bedOnce);
  bedRun.set(bedOnce, bedOnce.length);
  const bed = loopBed(bedRun, length, Math.round((MENU_CLIP_MIX.bedFadeMs / 1000) * RATE));
  const bedGain = 10 ** ((rmsDb(events, 0, length) + MENU_CLIP_MIX.bedDb - rmsDb(bed, 0, length)) / 20);
  const mixed = events.map((x, i) => x + bed[i]! * bedGain);
  const muffled = lowPassLoop(mixed, RATE, MENU_CLIP_MIX.cutoffHz);
  const track = normalize(compressLoop(muffled, RATE, MENU_CLIP_MIX.compression), MENU_CLIP_MIX.peakDb);
  writeFileSync(file, wavFile(track, RATE));
  return track;
}

/** The share of pixels that differ by more than `threshold` in any channel. */
function differingShare(a: Buffer, b: Buffer, threshold = 24): number {
  const one = PNG.sync.read(a);
  const two = PNG.sync.read(b);
  let differing = 0;
  for (let i = 0; i < one.data.length; i += 4)
    if ([0, 1, 2].some((c) => Math.abs(one.data[i + c]! - two.data[i + c]!) > threshold)) differing++;
  return differing / (one.width * one.height);
}

test('records the menu clip: a seamless loop, picture and sound, within budget', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
  const wav = join(EVIDENCE, 'menu-clip-audio.wav');
  const track = mixTrack(wav, await clipSounds());
  const length = track.length;
  expect(length).toBe(Math.round((MENU_CLIP.loopMs / 1000) * RATE));
  // No jump at the loop point: the level just before it is close to the level just after it.
  const span = RATE / 20;
  expect(Math.abs(rmsDb(track, length - span, length) - rmsDb(track, length, length + span))).toBeLessThan(6);
  ffmpeg(['-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', join(EVIDENCE, 'menu-clip-audio.mp3')]);

  await page.goto('/?test=1&step=manual&clip=1');
  await page.waitForFunction(() => window.__TD__ !== undefined);
  // The version label sits over a corner of the page; it isn't part of the battle.
  await page.addStyleTag({ content: '#version { display: none !important; }' });
  const fps = MENU_CLIP.fps;
  const warmUpFrames = (MENU_CLIP.warmUpMs / 1000) * fps;
  for (let done = 0; done < warmUpFrames; done += 300) {
    const frames = Math.min(300, warmUpFrames - done);
    await page.evaluate((n) => window.__TD__!.clipFrames(n), frames);
  }
  /** Draws the frame the clip is on and screenshots it. */
  const frame = async (advance: number): Promise<Buffer> => {
    await page.evaluate(
      (n) =>
        new Promise<void>((resolve) => {
          window.__TD__!.clipFrames(n);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
      advance,
    );
    return page.screenshot({ type: 'png' });
  };

  const intermediate = join(EVIDENCE, 'menu-clip-master.mkv');
  const encoder = spawn(
    'ffmpeg',
    ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-'].concat([
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '8',
      '-pix_fmt',
      'yuv444p',
      intermediate,
    ]),
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const loopFrames = (MENU_CLIP.loopMs / 1000) * fps;
  let first: Buffer | undefined;
  let last: Buffer | undefined;
  for (let f = 0; f <= loopFrames; f++) {
    const shot = await frame(f === 0 ? 0 : 1);
    if (f === 0) first = shot;
    if (f === loopFrames) {
      last = shot;
      break;
    }
    if (!encoder.stdin.write(shot)) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [code] = (await once(encoder, 'close')) as [number];
  expect(code).toBe(0);
  writeFileSync(join(EVIDENCE, 'first.png'), first!);
  writeFileSync(join(EVIDENCE, 'last.png'), last!);
  ffmpeg([
    '-i',
    join(EVIDENCE, 'first.png'),
    '-i',
    join(EVIDENCE, 'last.png'),
    '-filter_complex',
    '[0]scale=640:-1[a];[1]scale=640:-1[b];[a][b]hstack',
    join(EVIDENCE, 'first-and-last.png'),
  ]);
  // The loop check: the frame at L, which the video doesn't show, is the frame at 0 again.
  const share = differingShare(first!, last!);
  writeFileSync(join(EVIDENCE, 'loop-check.json'), JSON.stringify({ differingShare: share }));
  expect(share).toBeLessThan(0.005);

  const encodes = [
    { file: 'menu-clip.webm', size: '1280:720', video: ['-c:v', 'libvpx-vp9', '-b:v', '420k'], audio: 'opus' },
    { file: 'menu-clip.mp4', size: '1280:720', video: ['-c:v', 'libx264', '-b:v', '420k'], audio: 'aac' },
    { file: 'menu-clip-small.webm', size: '640:360', video: ['-c:v', 'libvpx-vp9', '-b:v', '180k'], audio: 'opus' },
    { file: 'menu-clip-small.mp4', size: '640:360', video: ['-c:v', 'libx264', '-b:v', '200k'], audio: 'aac' },
  ] as const;
  for (const { file, size, video, audio } of encodes) {
    const vp9 = video[1] === 'libvpx-vp9';
    const common = ['-i', intermediate, '-vf', `scale=${size}:flags=lanczos`, '-pix_fmt', 'yuv420p', ...video];
    const tuning = vp9
      ? ['-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-g', '300']
      : ['-preset', 'slow', '-profile:v', 'high', '-g', '300'];
    const log = join(EVIDENCE, `${file}-pass`);
    ffmpeg([...common, ...tuning, '-pass', '1', '-passlogfile', log, '-an', '-f', vp9 ? 'webm' : 'mp4', '/dev/null']);
    ffmpeg([
      ...common.slice(0, 2),
      '-i',
      wav,
      ...common.slice(2),
      ...tuning,
      '-pass',
      '2',
      '-passlogfile',
      log,
      ...(audio === 'opus' ? ['-c:a', 'libopus', '-b:a', '48k'] : ['-c:a', 'aac', '-b:a', '64k']),
      '-ac',
      '1',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-shortest',
      ...(vp9 ? [] : ['-movflags', '+faststart']),
      join(OUT, file),
    ]);
    expect(statSync(join(OUT, file)).size).toBeLessThan(BUDGET_BYTES);
  }
  ffmpeg(['-i', join(EVIDENCE, 'first.png'), '-c:v', 'libwebp', '-quality', '80', join(OUT, 'menu-clip-still.webp')]);
  expect(readFileSync(join(OUT, 'menu-clip-still.webp')).length).toBeGreaterThan(1000);
});
