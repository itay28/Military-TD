/**
 * Builds the radio comms cues (#396): `assets/radio-cues/{waveStart,victory,defeat}.ogg`, from Kenney's voice lines
 * (`assets/kenney-voiceover/`) and real scanner noise (`assets/kresiek-radio-noise/`). Every input is in the repo, so a
 * cue can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg on the PATH.
 *
 *   node scripts/radio-fx.ts
 *
 * Each cue is a timeline of parts mixed together: voice lines through a radio (a compressor and a soft clip inside a
 * 300–3400 Hz band-pass, so the clip's harmonics stay in the band), squelch bursts at the start and end of a
 * transmission, and a static bed under the voice. Defeat breaks up
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
const BAND = 'highpass=f=300,highpass=f=300,lowpass=f=3400,lowpass=f=3400';
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
  readonly parts: readonly Part[];
}

/** The click-and-hiss of a key-up or key-down. */
const squelch = (at: number, dur = 0.12): Part => ({ kind: 'static', at, dur, db: -2, fadeIn: 0.004, fadeOut: 0.05 });
/** The faint hiss under a transmission. */
const bed = (at: number, dur: number, db = -20): Part => ({ kind: 'static', at, dur, db, fadeIn: 0.03, fadeOut: 0.05 });

const CUES: readonly Cue[] = [
  {
    // Alert: "Look out! Go go go!"
    id: 'waveStart',
    length: 2.2,
    parts: [
      squelch(0),
      bed(0.1, 1.95),
      { kind: 'voice', line: 'war_look_out', at: 0.14 },
      { kind: 'voice', line: 'war_go_go_go', at: 0.85 },
      squelch(1.98, 0.2),
    ],
  },
  {
    // Relieved: "Mission completed." on a clean link.
    id: 'victory',
    length: 1.9,
    parts: [
      squelch(0),
      bed(0.1, 1.55, -26),
      { kind: 'voice', line: 'mission_completed', at: 0.18, db: 4 },
      squelch(1.68, 0.2),
    ],
  },
  {
    // Urgent and breaking up: "Call for backup! Mission failed—" then the signal dies.
    id: 'defeat',
    length: 2.85,
    parts: [
      { kind: 'static', at: 0, dur: 0.3, db: 0, fadeIn: 0.004, fadeOut: 0.06 },
      bed(0.2, 2.45, -14),
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

  voices.forEach((v, i) => {
    const breakUp = v.breakUp ? ',tremolo=f=11:d=0.6,acrusher=bits=8:mix=0.4' : '';
    chains.push(
      `[${i}]aresample=${RATE},${BAND},${COMPRESS},volume=${v.db ?? 0}dB,asoftclip=type=tanh${breakUp},${BAND},${delay(v.at)}[v${i}]`,
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
      `[n${i}]atrim=start=${start}:duration=${s.dur},asetpts=PTS-STARTPTS,${BAND},volume=${s.db}dB,` +
        `afade=t=in:d=${fadeIn},afade=t=out:st=${Math.max(0, s.dur - fadeOut)}:d=${fadeOut},${delay(s.at)}[s${i}]`,
    );
    labels.push(`[s${i}]`);
  });
  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,` +
      `atrim=end=${cue.length},alimiter=limit=0.9[out]`,
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
