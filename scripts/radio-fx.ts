/**
 * Builds the radio comms cues (#396): `assets/radio-cues/{waveStart,victory,defeat}.ogg`, from Kenney's voice lines
 * (`assets/kenney-voiceover/`) and real scanner noise (`assets/kresiek-radio-noise/`). Every input is in the repo, so a
 * cue can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg on the PATH.
 *
 *   node scripts/radio-fx.ts
 *
 * Each cue is a timeline of parts mixed together: voice lines through a radio (a compressor and a soft clip inside a
 * 300–3400 Hz band-pass, so the clip's harmonics stay in the band), squelch bursts at the start and end of a
 * transmission, and a static bed under the voice. Victory and defeat have a narrower band and more drive, crush and
 * static, and sit 13 dB down so they stay under the gameplay mix. Defeat breaks up
 * (a fast tremolo and bit crush on the last line) and cuts out on a static burst, with no closing squelch.
 * After a rebuild, update `RADIO_CUE_MS` in `src/data/sounds.ts` to the lengths this prints (a test checks them).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const VOICE_DIR = 'assets/kenney-voiceover';
const NOISE = 'assets/kresiek-radio-noise/radio-noise.flac';
const OUT_DIR = 'assets/radio-cues';
const RATE = 44100;

/** The radio's voice band, about a handheld's. */
const bandFor = (low: number, high: number): string =>
  `highpass=f=${low},highpass=f=${low},lowpass=f=${high},lowpass=f=${high}`;
const BAND = bandFor(300, 3400);
/** Evens out a line and drives it into the clip, as a radio's mic gain does. */
const COMPRESS = 'acompressor=threshold=-24dB:ratio=6:attack=5:release=80:makeup=4';

type Part =
  /** A voice line at `at` s, `db` louder (default 0). `breakUp` makes it drop in and out, as on a failing link. */
  | { kind: 'voice'; line: string; at: number; db?: number; breakUp?: boolean }
  /** `dur` s of static at `at` s and `db` dB, with short fades so it doesn't click. */
  | { kind: 'static'; at: number; dur: number; db: number; fadeIn?: number; fadeOut?: number };

interface Cue {
  readonly id: 'waveStart' | 'victory' | 'defeat';
  /** The cue's length in s; anything past it is cut. */
  readonly length: number;
  /** The cue's level in dB, applied last: victory and defeat sit under the gameplay mix (about -24 LUFS, like the SFX). */
  readonly gainDb: number;
  /** A tighter voice band for a rougher link (default 300–3400 Hz). */
  readonly band?: string;
  /** dB of extra drive into the clip, for more crunch. */
  readonly driveDb?: number;
  /** Bit crush on every voice line (bits), for a digital, crunchy link. */
  readonly crushBits?: number;
  readonly parts: readonly Part[];
}

/** The click-and-hiss of a key-up or key-down. */
const squelch = (at: number, dur = 0.12): Part => ({ kind: 'static', at, dur, db: -2, fadeIn: 0.004, fadeOut: 0.05 });
/** The faint hiss under a transmission. */
const bed = (at: number, dur: number, db = -20): Part => ({ kind: 'static', at, dur, db, fadeIn: 0.03, fadeOut: 0.05 });

const CUES: readonly Cue[] = [
  {
    // Alert: "Look out!" (a defence calls the threat, it doesn't charge.)
    id: 'waveStart',
    length: 1.3,
    gainDb: 0,
    parts: [squelch(0), bed(0.1, 1.05), { kind: 'voice', line: 'war_look_out', at: 0.14 }, squelch(1.08, 0.2)],
  },
  {
    // Relieved: "Mission completed." on a clean link.
    id: 'victory',
    length: 1.9,
    gainDb: -13,
    band: bandFor(400, 2800),
    driveDb: 8,
    crushBits: 10,
    parts: [
      squelch(0),
      bed(0.1, 1.55, -18),
      { kind: 'voice', line: 'mission_completed', at: 0.18, db: 4 },
      squelch(1.68, 0.2),
    ],
  },
  {
    // Urgent and breaking up: "Call for backup! Mission failed—" then the signal dies.
    id: 'defeat',
    length: 2.85,
    gainDb: -13,
    band: bandFor(450, 2500),
    driveDb: 10,
    crushBits: 8,
    parts: [
      { kind: 'static', at: 0, dur: 0.3, db: 0, fadeIn: 0.004, fadeOut: 0.06 },
      bed(0.2, 2.45, -10),
      { kind: 'voice', line: 'war_call_for_backup', at: 0.26 },
      { kind: 'voice', line: 'mission_failed', at: 1.38, breakUp: true },
      // The cut-out: a last loud burst that stops dead.
      { kind: 'static', at: 2.55, dur: 0.3, db: 2, fadeIn: 0.01, fadeOut: 0.005 },
    ],
  },
];

const delay = (at: number): string => `adelay=${Math.round(at * 1000)}:all=1`;

function build(cue: Cue): void {
  const voices = cue.parts.filter((p) => p.kind === 'voice');
  const statics = cue.parts.filter((p) => p.kind === 'static');
  const inputs = [...voices.map((v) => `${VOICE_DIR}/${v.line}.ogg`), NOISE];
  const noiseIn = voices.length;
  const chains: string[] = [];
  const labels: string[] = [];

  const band = cue.band ?? BAND;
  voices.forEach((v, i) => {
    const crush = cue.crushBits ? `,acrusher=bits=${cue.crushBits}:mix=0.5` : '';
    const breakUp = v.breakUp ? ',tremolo=f=11:d=0.6,acrusher=bits=8:mix=0.4' : '';
    const drive = (v.db ?? 0) + (cue.driveDb ?? 0);
    chains.push(
      `[${i}]aresample=${RATE},${band},${COMPRESS},volume=${drive}dB,asoftclip=type=tanh${crush}${breakUp},${band},${delay(v.at)}[v${i}]`,
    );
    labels.push(`[v${i}]`);
  });
  chains.push(`[${noiseIn}]aresample=${RATE},asplit=${statics.length}${statics.map((_, i) => `[n${i}]`).join('')}`);
  statics.forEach((s, i) => {
    // A different stretch of the noise for each part, so the bursts don't repeat.
    const start = (i * 1.7) % 6;
    const fadeIn = s.fadeIn ?? 0.01;
    const fadeOut = s.fadeOut ?? 0.01;
    chains.push(
      `[n${i}]atrim=start=${start}:duration=${s.dur},asetpts=PTS-STARTPTS,${band},volume=${s.db}dB,` +
        `afade=t=in:d=${fadeIn},afade=t=out:st=${Math.max(0, s.dur - fadeOut)}:d=${fadeOut},${delay(s.at)}[s${i}]`,
    );
    labels.push(`[s${i}]`);
  });
  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,` +
      `atrim=end=${cue.length},alimiter=limit=0.9,volume=${cue.gainDb}dB[out]`,
  );

  const out = `${OUT_DIR}/${cue.id}.ogg`;
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y'],
    ...inputs.flatMap((file) => ['-i', file]),
    ...['-filter_complex', chains.join(';'), '-map', '[out]'],
    ...['-ac', '1', '-ar', String(RATE), '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', out],
  ]);
  const seconds = execFileSync('ffprobe', [
    ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
  ]).toString();
  console.log(`${out}: ${Math.round(Number(seconds) * 1000)} ms`);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const cue of CUES) build(cue);
