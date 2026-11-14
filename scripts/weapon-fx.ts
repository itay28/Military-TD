/**
 * Builds the weapon sounds (#404): `assets/weapon-sounds/<id>.ogg`, from the CC0 clips committed beside it
 * (`assets/free-firearm-sfx/`, `assets/mikeask-missile/`, `assets/thimras-cannon/`, `assets/ezduzziteh-explosions/`).
 * Every input is in the repo, so a sound can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg on the PATH.
 *
 *   node scripts/weapon-fx.ts
 *
 * Each sound is a few layers mixed together: a clip from `at` s, `dur` s long, optionally re-pitched (`rate`, which also
 * changes its length, as a heavier gun's lower report would), filtered and set to `db`. The mortar's incoming whistle is
 * synthesized (a breathy note falling in pitch), since no CC0 recording of one was found; the explosions add a
 * synthesized sub-bass thump and a debris crackle to their recordings for weight.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_DIR = 'assets/weapon-sounds';
const RATE = 48000;

const AK = 'assets/free-firearm-sfx/ak47-burst.flac';
const AR = 'assets/free-firearm-sfx/ar15-shot.flac';
const RIFLE_30 = 'assets/free-firearm-sfx/springfield-shot.flac';
const MISSILE = 'assets/mikeask-missile/missile-launch.ogg';
const CANNON = 'assets/thimras-cannon/cannon_fire.ogg';
const BOOM_BIG = 'assets/ezduzziteh-explosions/explosion1.ogg';
const BOOM_SMALL = 'assets/ezduzziteh-explosions/explosion2.ogg';
const BOOM_MID = 'assets/ezduzziteh-explosions/explosion3.ogg';

interface Layer {
  /** The clip, or a synthesized source: `whistle` (falling breathy note), `thump` (sub-bass hit), `crackle` (debris). */
  readonly file: string | 'whistle' | 'thump' | 'crackle';
  /** Where in the sound this layer starts, in s. */
  readonly delay?: number;
  /** Where in the clip to start, and how much of it to take, in s. */
  readonly from?: number;
  readonly dur: number;
  /** Playback speed: below 1 is lower and longer. */
  readonly rate?: number;
  readonly db?: number;
  /** Extra ffmpeg filters, such as a low-pass. */
  readonly filter?: string;
}

interface Sound {
  readonly id: string;
  /** Total length in s, with a short fade at the end so nothing clicks. */
  readonly length: number;
  /** That fade, in s (default 0.08). The whistle's is short: the impact cuts it off at full loudness. */
  readonly fade?: number;
  readonly layers: readonly Layer[];
}

/**
 * One round of an autocannon: a .30-06 report pitched down, as a 23 mm gun's heavier thud. The AA Gun fires 3 shots a
 * second (3.75 upgraded), one sound per shot, so it is short enough to end before the next (0.27 s) and a stream of
 * shots keeps the gun's own rate.
 */
const autocannon: Layer[] = [{ file: RIFLE_30, from: 0.1, dur: 0.26, rate: 0.7, filter: 'lowpass=f=5000' }];

const SOUNDS: readonly Sound[] = [
  {
    // Rifle Nest: an AK burst over a 5.56 crack, so the squad reads as more than one rifle.
    id: 'rifleShot',
    length: 0.75,
    layers: [
      { file: AK, from: 0.1, dur: 0.6 },
      { file: AR, from: 0.09, dur: 0.4, delay: 0.05, db: -5 },
    ],
  },
  {
    // Sniper: one heavy .30-06 crack with its long tail, a single deliberate shot (it fires every 2.5 s).
    id: 'sniperShot',
    length: 1.2,
    layers: [
      { file: RIFLE_30, from: 0.1, dur: 1.1, rate: 0.85, db: 2 },
      { file: AR, from: 0.09, dur: 0.3, db: -9, filter: 'highpass=f=1500' },
    ],
  },
  { id: 'aaGunBurst', length: 0.26, layers: autocannon },
  {
    // TOW and HJ-8: the launch motor's whoosh, with a low thump from the eject charge.
    id: 'missileLaunch',
    length: 1.8,
    layers: [
      { file: MISSILE, dur: 1.8, db: 12 },
      { file: CANNON, dur: 0.4, db: -12, filter: 'lowpass=f=300' },
    ],
  },
  {
    // MT-12: a 100 mm gun's report, with a rifle's supersonic crack on top.
    id: 'gunReport',
    length: 1.6,
    layers: [
      { file: CANNON, dur: 1.6 },
      { file: RIFLE_30, from: 0.1, dur: 0.3, db: -6, filter: 'highpass=f=1500' },
    ],
  },
  {
    // SPG-9: a recoilless blast is a dull boom with a hiss of backblast behind it.
    id: 'recoillessBlast',
    length: 1.6,
    layers: [
      { file: CANNON, dur: 1.6, rate: 0.85, db: -1, filter: 'lowpass=f=2500' },
      { file: MISSILE, from: 0.05, dur: 0.7, db: 8, filter: 'highpass=f=1200' },
    ],
  },
  {
    // A light mortar's launch: the bomb's sharp "tonk" as it drops down the tube, a short hollow thump under it.
    id: 'mortarLaunch',
    length: 0.5,
    layers: [
      { file: CANNON, dur: 0.35, rate: 0.95, db: 0, filter: 'lowpass=f=1800,highpass=f=120' },
      { file: RIFLE_30, from: 0.1, dur: 0.15, db: -9, rate: 0.9, filter: 'lowpass=f=3000' },
    ],
  },
  { id: 'mortarWhistle', length: 0.5, fade: 0.008, layers: [{ file: 'whistle', dur: 0.5 }] },
  {
    // A mortar bomb's impact: a sharp crack, then the earth thump and a debris patter, not a gun's long boom.
    id: 'mortarBlast',
    length: 1.6,
    layers: [
      { file: BOOM_MID, dur: 1.4, rate: 0.8, db: -3, filter: 'lowpass=f=3500' },
      { file: RIFLE_30, from: 0.1, dur: 0.2, db: -8, filter: 'highpass=f=1200' },
      { file: 'thump', dur: 0.8, db: -2, rate: 1.2 },
      { file: 'crackle', dur: 1.2, delay: 0.15, db: -12 },
    ],
  },
  {
    // A vehicle destroyed: a deep, slow blast (about half speed) with a sub-bass thump, a second blast as ammunition or
    // fuel goes up a moment later, a long rumbling tail and debris; heavy and long, unlike the infantry hit.
    id: 'vehicleExplosion',
    length: 3.6,
    layers: [
      { file: BOOM_BIG, dur: 3.4, rate: 0.55, db: -6, filter: 'lowpass=f=3000,bass=g=6:f=70' },
      { file: 'thump', dur: 1, db: 3, rate: 0.85 },
      { file: BOOM_MID, dur: 2.2, rate: 0.7, delay: 0.45, db: -5, filter: 'lowpass=f=1800' },
      { file: 'crackle', dur: 2.2, delay: 0.3, db: -11 },
    ],
  },
  // Infantry hit: a short, lighter blast.
  { id: 'infantryHit', length: 0.6, layers: [{ file: BOOM_SMALL, dur: 0.6, db: -4, filter: 'highpass=f=120' }] },
];

/** A seeded PRNG (mulberry32), so `npm run weapon-fx` rebuilds the same whistle. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian white noise (Box-Muller). */
function gaussian(n: number, rand: () => number): number[] {
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()));
}

/** A centred moving average over `w` samples. */
function smooth(x: readonly number[], w: number): number[] {
  const sum = [0];
  for (const v of x) sum.push((sum[sum.length - 1] ?? 0) + v);
  return x.map((_, i) => {
    const lo = Math.max(0, i - (w >> 1));
    const hi = Math.min(x.length, i + (w >> 1));
    return ((sum[hi] ?? 0) - (sum[lo] ?? 0)) / (hi - lo);
  });
}

/** Noise through a band-pass whose centre follows `freq(i)` (Hz): a breathy note at that pitch. */
function resonate(x: readonly number[], freq: (i: number) => number, q: number): number[] {
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return x.map((xn, n) => {
    const w = (2 * Math.PI * freq(n)) / RATE;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const yn = (alpha / a0) * (xn - x2) + ((2 * Math.cos(w)) / a0) * y1 - ((1 - alpha) / a0) * y2;
    [x2, x1, y2, y1] = [x1, xn, y1, yn];
    return yn;
  });
}

function normalized(x: readonly number[]): number[] {
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 1e-9);
  return x.map((v) => v / peak);
}

/**
 * An incoming mortar bomb's whistle: a breathy note, not a clean tone (a person whistling) and not broadband air (a
 * missile's rush). Noise through a narrow band-pass (Q 45) falling from 1.7 to 0.9 kHz, slowly at first and faster
 * near impact (the Doppler drop), with a slight irregular flutter (air over the fins), a faint overtone and a little
 * air. It gets louder as the bomb closes (20 dB) and is cut off by the impact. Written as a WAV for ffmpeg to mix.
 */
function whistleSource(dur: number): string {
  const rand = seeded(404);
  const n = Math.round(RATE * dur);
  let acc = 0;
  const walk = gaussian(n, rand).map((v) => (acc += v));
  const trend = smooth(walk, 2400);
  const flutter = normalized(
    smooth(
      walk.map((v, i) => v - (trend[i] ?? 0)),
      600,
    ),
  );
  const freq = (i: number): number => (1700 - 800 * (i / n) ** 2.2) * (1 + 0.012 * (flutter[i] ?? 0));
  const tone = normalized(resonate(gaussian(n, rand), freq, 45));
  const overtone = normalized(resonate(gaussian(n, rand), (i) => 2 * freq(i), 67.5));
  const air = normalized(resonate(gaussian(n, rand), (i) => 1.3 * freq(i), 1.2));
  const mix = tone.map((v, i) => {
    const t = i / RATE;
    const gain = 10 ** ((-20 + 20 * (i / n) ** 1.5) / 20) * Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.008);
    return gain * (v + 0.2 * (overtone[i] ?? 0) + 0.1 * (air[i] ?? 0));
  });
  const path = join(tmpdir(), `weapon-fx-whistle-${process.pid}.wav`);
  writeFileSync(path, wav(normalized(mix).map((v) => v * 0.7)));
  return path;
}

/** A mono 16-bit WAV file. */
function wav(samples: readonly number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** A sub-bass hit: a 55 Hz sine falling to 38 Hz, decaying over about 0.4 s. */
function thumpSource(dur: number): string {
  return `aevalsrc='0.9*sin(2*PI*(38*t+17*0.12*(1-exp(-t/0.12))))*exp(-t*7)':s=${RATE}:d=${dur}`;
}

/** Debris: noise crackling in irregular bursts, decaying. Deterministic: ffmpeg's noise seed is fixed. */
function crackleSource(dur: number): string {
  return (
    `anoisesrc=c=white:r=${RATE}:d=${dur}:a=0.9:seed=404,highpass=f=800,lowpass=f=6000,` +
    `volume='pow(max(0,sin(2*PI*23*t)*sin(2*PI*7.3*t+1)),2)*exp(-t*2.2)':eval=frame`
  );
}

/** Synthesized sources, as ffmpeg lavfi graphs. */
const SYNTH: Record<string, (dur: number) => string> = {
  thump: thumpSource,
  crackle: crackleSource,
};

function layerChain(layer: Layer, input: number, label: string, fade: number): string {
  const parts: string[] = [`[${input}]aresample=${RATE}`, 'aformat=channel_layouts=mono'];
  if (layer.from !== undefined) parts.push(`atrim=start=${layer.from}`, 'asetpts=PTS-STARTPTS');
  if (layer.rate !== undefined) parts.push(`asetrate=${Math.round(RATE * layer.rate)}`, `aresample=${RATE}`);
  parts.push(`atrim=duration=${layer.dur}`, `afade=t=out:st=${Math.max(0, layer.dur - fade)}:d=${fade}`);
  if (layer.filter) parts.push(layer.filter);
  parts.push(`volume=${layer.db ?? 0}dB`, `adelay=${Math.round((layer.delay ?? 0) * 1000)}:all=1`);
  return `${parts.join(',')}[${label}]`;
}

function build(sound: Sound): void {
  const args: string[] = [];
  const temp: string[] = [];
  sound.layers.forEach((layer) => {
    const synth = SYNTH[layer.file];
    if (layer.file === 'whistle') {
      const path = whistleSource(layer.dur);
      temp.push(path);
      args.push('-i', path);
    } else if (synth) args.push('-f', 'lavfi', '-i', synth(layer.dur));
    else args.push('-i', layer.file);
  });
  const fade = sound.fade ?? 0.08;
  const chains = sound.layers.map((layer, i) => layerChain(layer, i, `l${i}`, Math.min(fade, 0.05)));
  const labels = sound.layers.map((_, i) => `[l${i}]`).join('');
  chains.push(
    `${labels}amix=inputs=${sound.layers.length}:normalize=0:duration=longest,` +
      `atrim=end=${sound.length},afade=t=out:st=${sound.length - fade}:d=${fade},alimiter=limit=0.9[out]`,
  );
  const out = `${OUT_DIR}/${sound.id}.ogg`;
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y', ...args],
    ...['-filter_complex', chains.join(';'), '-map', '[out]'],
    ...['-ac', '1', '-ar', String(RATE), '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', out],
  ]);
  for (const path of temp) rmSync(path, { force: true });
  console.log(out);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const sound of SOUNDS) build(sound);
