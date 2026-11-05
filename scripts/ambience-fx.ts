/**
 * Builds the battlefield ambience (#405): `assets/battlefield-ambience/{ambient,combat}.{ogg,mp3}`, the loops the Game
 * plays instead of music. Every input is in the repo, so a loop can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg
 * on the PATH.
 *
 *   node scripts/ambience-fx.ts
 *
 * `ambient` is the bed, always on in the Game: wind (seeded noise, synthesized here), sparse distant gunfire (The Free
 * Firearm Sound Library, muffled and echoed as if far off) and faint radio chatter (Kresiek The Furry's Radio Noise 1 for
 * the squelches, and the radio voice takes played backwards through a narrow band, so they read as chatter, not as
 * lines). `combat` is the layer the Game mixes over the bed during a wave: denser distant fire and far-off blasts
 * (EZduzziteh's Explosions). The events are placed by a seeded random, so a rebuild gives the same loop.
 *
 * Seamless loops: an event that runs past the loop's end is folded back onto its start (the overflow is mixed into the
 * head), and the wind's tail is crossfaded into its head. The script prints each loop's loudness and the level at the
 * seam (the last and first 50 ms), so a click shows as a jump there, checked by numbers, not by ear.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_DIR = 'assets/battlefield-ambience';
const RATE = 44100;
/** Each loop's length in s. */
const LENGTH = 32;
/** How long the wind's tail crossfades into its head, s. */
const WIND_XFADE = 4;
/** Room for an event's tail past the loop's end, folded back onto the head. */
const TAIL = 6;

const AK = 'assets/free-firearm-sfx/ak47-burst.flac';
const AR = 'assets/free-firearm-sfx/ar15-shot.flac';
const RIFLE_30 = 'assets/free-firearm-sfx/springfield-shot.flac';
const BOOM_BIG = 'assets/ezduzziteh-explosions/explosion1.ogg';
const BOOM_MID = 'assets/ezduzziteh-explosions/explosion3.ogg';
const NOISE = 'assets/kresiek-radio-noise/radio-noise.flac';
const TAKES = ['waveStart', 'waveReinforcements', 'victory', 'defeat'].map((t) => `assets/radio-voice/takes/${t}.flac`);

type LoopId = 'ambient' | 'combat';

/** One sound on the loop's timeline. */
interface Event {
  readonly file: string;
  /** When it starts, s. */
  readonly at: number;
  readonly db: number;
  /** Left (-1) to right (1). */
  readonly pan: number;
  /** The filter chain that places it: distance (muffle, echo) or the radio. */
  readonly chain: string;
  /** Plays a stretch of the file: start and length in s. */
  readonly trim?: readonly [number, number];
}

interface Loop {
  readonly id: LoopId;
  /** The finished loop's loudness, LUFS: under the sound effects (about -24 LUFS), so the fight stays on top. */
  readonly targetLufs: number;
  /** Wind level in dB, or none. */
  readonly windDb?: number;
  readonly events: readonly Event[];
}

/** A small seeded random (mulberry32), so a rebuild places every event in the same spot. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Far off: the highs gone, a slower pitch for a heavier report, and the echo off hills and buildings. */
const distant = (cutoff: number, rate = 1): string =>
  `asetrate=${Math.round(RATE * rate)},aresample=${RATE},lowpass=f=${cutoff},lowpass=f=${cutoff},` +
  `aecho=0.8:0.6:180|420:0.35|0.2`;
/** A far-off radio: a narrow band, a little crush, the voice backwards so no line is understood. */
const chatter = 'areverse,highpass=f=600,lowpass=f=1800,acrusher=bits=8:mix=0.4,highpass=f=600,lowpass=f=1800';
const squelchChain = 'highpass=f=400,lowpass=f=3000';

/** `count` events spread over the loop, each at a random time in its own slot, so they never bunch up. */
function spread(
  rand: () => number,
  count: number,
  make: (at: number, rand: () => number) => Event | readonly Event[],
): Event[] {
  const slot = LENGTH / count;
  return Array.from({ length: count }, (_, i) => make(i * slot + rand() * slot * 0.8, rand)).flat();
}

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (rand: () => number, low: number, high: number): number => low + rand() * (high - low);

function ambientEvents(): Event[] {
  const rand = seeded(405);
  const gunfire = spread(rand, 7, (at, r) => ({
    file: pick(r, [AK, AR, RIFLE_30]),
    at,
    db: between(r, -24, -16),
    pan: between(r, -0.8, 0.8),
    chain: distant(between(r, 500, 900), between(r, 0.85, 1)),
  }));
  // A transmission: key-up squelch, a second or two of chatter, key-down.
  const radio = spread(rand, 3, (at, r) => {
    const take = pick(r, TAKES);
    const dur = between(r, 1, 1.6);
    const pan = between(r, -0.4, 0.4);
    const squelch = (when: number): Event => ({
      file: NOISE,
      at: when,
      db: -30,
      pan,
      chain: squelchChain,
      trim: [between(r, 0, 7), 0.1],
    });
    return [
      squelch(at),
      { file: take, at: at + 0.1, db: -27, pan, chain: chatter, trim: [0, dur] },
      squelch(at + 0.15 + dur),
    ];
  });
  return [...gunfire, ...radio];
}

function combatEvents(): Event[] {
  const rand = seeded(1405);
  const gunfire = spread(rand, 18, (at, r) => ({
    file: pick(r, [AK, AK, AR, RIFLE_30]),
    at,
    db: between(r, -18, -10),
    pan: between(r, -0.9, 0.9),
    chain: distant(between(r, 700, 1300), between(r, 0.85, 1.05)),
  }));
  const blasts = spread(rand, 4, (at, r) => ({
    file: pick(r, [BOOM_BIG, BOOM_MID]),
    at,
    db: between(r, -14, -8),
    pan: between(r, -0.7, 0.7),
    chain: distant(between(r, 250, 450), between(r, 0.8, 0.95)),
  }));
  return [...gunfire, ...blasts];
}

const LOOPS: readonly Loop[] = [
  { id: 'ambient', targetLufs: -32, windDb: -6, events: ambientEvents() },
  { id: 'combat', targetLufs: -31, events: combatEvents() },
];

const delay = (at: number): string => `adelay=${Math.round(at * 1000)}:all=1`;
const fx = (n: number): string => n.toFixed(3);

/** Runs ffmpeg over `inputs` with `graph`, its `[out]` written as a float WAV at `out`. */
function ffmpeg(inputs: readonly string[], graph: readonly string[], out: string): void {
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y'],
    ...inputs.flatMap((file) => ['-i', file]),
    ...['-filter_complex', graph.join(';'), '-map', '[out]'],
    ...['-ar', String(RATE), '-ac', '2', '-c:a', 'pcm_f32le', out],
  ]);
}

/**
 * The loop, unscaled, as a WAV at `out`, in passes (one ffmpeg graph that splits a stream and trims both halves ends
 * early): the events and the wind, each a little longer than the loop, then the fold and the crossfade that close it.
 */
function render(loop: Loop, work: string, out: string): void {
  const chains = loop.events.map((e, i) => {
    const trim = e.trim ? `atrim=start=${fx(e.trim[0])}:duration=${fx(e.trim[1])},asetpts=PTS-STARTPTS,` : '';
    const fade = e.trim ? `afade=t=in:d=0.01,afade=t=out:st=${fx(e.trim[1] - 0.03)}:d=0.03,` : '';
    const left = fx((1 - e.pan) / 2);
    const right = fx((1 + e.pan) / 2);
    return (
      `[${i}]aformat=channel_layouts=mono,aresample=${RATE},${trim}${fade}${e.chain},volume=${e.db}dB,` +
      `pan=stereo|c0=${left}*c0|c1=${right}*c0,${delay(e.at)},apad=whole_dur=${LENGTH + TAIL}[e${i}]`
    );
  });
  const labels = loop.events.map((_, i) => `[e${i}]`).join('');
  const events = join(work, `${loop.id}-events.wav`);
  ffmpeg(
    loop.events.map((e) => e.file),
    [
      ...chains,
      `${labels}amix=inputs=${loop.events.length}:normalize=0:duration=longest,atrim=end=${LENGTH + TAIL}[out]`,
    ],
    events,
  );
  // Fold: the events' overflow past LENGTH is mixed back onto the head, so the loop has no seam.
  const fold = [
    `[0]atrim=end=${LENGTH}[head]`,
    `[1]atrim=start=${LENGTH},asetpts=PTS-STARTPTS,apad=whole_dur=${LENGTH}[over]`,
    `[head][over]amix=inputs=2:normalize=0:duration=first[events]`,
  ];
  if (loop.windDb === undefined) {
    ffmpeg([events, events], [...fold, '[events]anull[out]'], out);
    return;
  }
  // Wind: brown noise rumble and a pink whistle, each swelling in gusts on periods that divide the loop.
  const gust = (k: number, depth: number, phase: number): string =>
    `volume='${fx(1 - depth)}+${fx(depth)}*(0.5+0.5*sin(2*PI*${k}*t/${LENGTH}+${phase}))':eval=frame`;
  const total = LENGTH + WIND_XFADE;
  const wind = join(work, `${loop.id}-wind.wav`);
  ffmpeg(
    [],
    [
      `anoisesrc=color=brown:seed=405:sample_rate=${RATE}:duration=${total},lowpass=f=320,${gust(3, 0.6, 0)},` +
        `volume=6dB[rumble]`,
      `anoisesrc=color=pink:seed=1405:sample_rate=${RATE}:duration=${total},bandpass=f=900:width_type=q:w=0.8,` +
        `${gust(5, 0.85, 1.3)},volume=-12dB[whistle]`,
      `[rumble][whistle]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo,extrastereo=m=0.4,` +
        `volume=${loop.windDb}dB[out]`,
    ],
    wind,
  );
  // The wind's tail past LENGTH crossfades into its head (equal power), so the noise runs on across the seam.
  ffmpeg(
    [events, events, wind, wind],
    [
      ...fold,
      `[2]atrim=end=${LENGTH},afade=t=in:d=${WIND_XFADE}:curve=qsin[whead]`,
      `[3]atrim=start=${LENGTH},asetpts=PTS-STARTPTS,afade=t=out:d=${WIND_XFADE}:curve=qsin,apad=whole_dur=${LENGTH}[wtail]`,
      `[whead][wtail]amix=inputs=2:normalize=0:duration=first[wind]`,
      `[events][wind]amix=inputs=2:normalize=0:duration=first[out]`,
    ],
    out,
  );
}

/** ffmpeg's log (its stderr) for running `filter` over `file`. */
function analyse(file: string, filter: string): string {
  return spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', filter, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
}

/** Integrated loudness in LUFS. */
function loudness(file: string): number {
  const log = analyse(file, 'ebur128');
  const match = /I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf('Summary')));
  if (!match) throw new Error(`no loudness for ${file}`);
  return Number(match[1]);
}

/** RMS level in dB of `dur` s from `start`. */
function rmsDb(file: string, start: number, dur: number): number {
  const log = analyse(
    file,
    `atrim=start=${start}:duration=${dur},astats=measure_overall=RMS_level:measure_perchannel=none`,
  );
  const match = /RMS level dB:\s+(-?[\d.]+)/.exec(log);
  return match ? Number(match[1]) : -Infinity;
}

const work = mkdtempSync(join(tmpdir(), 'ambience-'));
mkdirSync(OUT_DIR, { recursive: true });
try {
  for (const loop of LOOPS) {
    const raw = join(work, `${loop.id}.wav`);
    render(loop, work, raw);
    const gain = loop.targetLufs - loudness(raw);
    const scaled = join(work, `${loop.id}-scaled.wav`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', `volume=${fx(gain)}dB,alimiter=limit=0.9`, scaled]);
    const ogg = `${OUT_DIR}/${loop.id}.ogg`;
    const mp3 = `${OUT_DIR}/${loop.id}.mp3`;
    const tags = ['-map_metadata', '-1'];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', scaled, '-c:a', 'libvorbis', '-q:a', '2', ...tags, ogg]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', scaled, '-c:a', 'libmp3lame', '-b:a', '96k', ...tags, mp3]);
    const end = rmsDb(scaled, LENGTH - 0.05, 0.05);
    const start = rmsDb(scaled, 0, 0.05);
    console.log(
      `${ogg} (+ .mp3): ${LENGTH} s, ${loudness(scaled).toFixed(1)} LUFS, seam ${end.toFixed(1)} → ${start.toFixed(1)} dB RMS`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
