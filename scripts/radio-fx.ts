/**
 * Builds the radio comms cues (#396): `assets/radio-cues/{waveStart,waveReinforcements,victory,defeat}.ogg`, from the
 * committed voice takes (`assets/radio-voice/takes/`, made by `scripts/radio-voice.py`), real scanner noise
 * (`assets/kresiek-radio-noise/`) and, for defeat, gunfire and a blast (`assets/free-firearm-sfx/`,
 * `assets/ezduzziteh-explosions/`). Every input is in the repo, so a cue can be rebuilt or retuned (ADR-0003 spirit).
 * Needs ffmpeg on the PATH.
 *
 *   node scripts/radio-fx.ts
 *
 * Each cue is a timeline of parts mixed together: voice lines through a radio (a compressor and a soft clip inside a
 * 300–3400 Hz band-pass, so the clip's harmonics stay in the band), squelch bursts at the start and end of a
 * transmission, and a static bed under the voice. Victory and defeat have a narrower band and more drive, crush and
 * static, and sit 13 dB down so they stay under the gameplay mix. Defeat has gunfire in its opening static and in the
 * pause between its two lines, about as loud as the voice, then cuts out on a blast and a static burst, with no closing
 * squelch. Sound effects go through the same band, since they're heard over the radio.
 * After a rebuild, update `RADIO_CUE_MS` in `src/data/sounds.ts` to the lengths this prints (a test checks them).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const TAKES_DIR = 'assets/radio-voice/takes';
const NOISE = 'assets/kresiek-radio-noise/radio-noise.flac';
const GUNFIRE = 'assets/free-firearm-sfx/ak47-burst.flac';
const RIFLE = 'assets/free-firearm-sfx/ar15-shot.flac';
const BLAST = 'assets/ezduzziteh-explosions/explosion2.ogg';
const OUT_DIR = 'assets/radio-cues';
const RATE = 44100;

/** The radio's voice band, about a handheld's. */
const bandFor = (low: number, high: number): string =>
  `highpass=f=${low},highpass=f=${low},lowpass=f=${high},lowpass=f=${high}`;
const BAND = bandFor(300, 3400);
/** Evens out a line and drives it into the clip, as a radio's mic gain does. */
const COMPRESS = 'acompressor=threshold=-24dB:ratio=6:attack=5:release=80:makeup=4';

type CueId = 'waveStart' | 'waveReinforcements' | 'victory' | 'defeat';

type Part =
  /** The cue's voice take at `at` s, `db` louder (default 0). */
  | { kind: 'voice'; at: number; db?: number }
  /** A sound effect file at `at` s and `db` dB, through the radio band. */
  | { kind: 'sfx'; file: string; at: number; db: number }
  /** `dur` s of static at `at` s and `db` dB, with short fades so it doesn't click. */
  | { kind: 'static'; at: number; dur: number; db: number; fadeIn?: number; fadeOut?: number };

interface Cue {
  readonly id: CueId;
  /** The cue's length in s; anything past it is cut. */
  readonly length: number;
  /** The cue's level in dB, applied last: victory and defeat sit under the gameplay mix (about -24 LUFS, like the SFX). */
  readonly gainDb: number;
  /** A tighter voice band for a rougher link (default 300–3400 Hz). */
  readonly band?: string;
  /** dB of extra drive into the clip, for more crunch. */
  readonly driveDb?: number;
  /** Bit crush on the voice (bits), for a digital, crunchy link. */
  readonly crushBits?: number;
  readonly parts: readonly Part[];
}

/** The click-and-hiss of a key-up or key-down. */
const squelch = (at: number, dur = 0.12): Part => ({ kind: 'static', at, dur, db: -2, fadeIn: 0.004, fadeOut: 0.05 });
/** The faint hiss under a transmission. */
const bed = (at: number, dur: number, db = -20): Part => ({ kind: 'static', at, dur, db, fadeIn: 0.03, fadeOut: 0.05 });

// Take timings (speech ends): waveStart 2.39 s, waveReinforcements 3.27 s, victory 1.77 s, defeat 1.62 s with a
// pause at 1.02–1.15 s between "They're breaking through!" and "Fall back!".
const CUES: readonly Cue[] = [
  {
    // "Contact front! Enemy inbound. Over."
    id: 'waveStart',
    length: 2.75,
    gainDb: 0,
    parts: [squelch(0), bed(0.1, 2.45), { kind: 'voice', at: 0.14 }, squelch(2.55, 0.2)],
  },
  {
    // "Be advised, enemy reinforcements inbound. Over." (enemies from the last wave are still on the field)
    id: 'waveReinforcements',
    length: 3.5,
    gainDb: 0,
    parts: [squelch(0), bed(0.1, 3.25), { kind: 'voice', at: 0.1 }, squelch(3.36, 0.14)],
  },
  {
    // "Area secure! Out." on a clean link.
    id: 'victory',
    length: 2.2,
    gainDb: -13,
    band: bandFor(400, 2800),
    driveDb: 8,
    crushBits: 10,
    parts: [squelch(0), bed(0.1, 1.85, -18), { kind: 'voice', at: 0.18, db: 4 }, squelch(1.98, 0.2)],
  },
  {
    // Under fire: gunfire, "They're breaking through!", gunfire, "Fall back!", then a blast and the signal dies.
    id: 'defeat',
    length: 2.45,
    gainDb: -13,
    band: bandFor(450, 2500),
    driveDb: 10,
    crushBits: 8,
    parts: [
      { kind: 'static', at: 0, dur: 0.3, db: 0, fadeIn: 0.004, fadeOut: 0.06 },
      { kind: 'sfx', file: GUNFIRE, at: 0, db: 8 },
      bed(0.2, 2.05, -10),
      { kind: 'voice', at: 0.32 },
      { kind: 'sfx', file: RIFLE, at: 1.3, db: 12 },
      // The cut-out: a blast, then a last loud burst that stops dead.
      { kind: 'sfx', file: BLAST, at: 1.98, db: 8 },
      { kind: 'static', at: 2.15, dur: 0.3, db: 2, fadeIn: 0.01, fadeOut: 0.005 },
    ],
  },
];

const delay = (at: number): string => `adelay=${Math.round(at * 1000)}:all=1`;

function build(cue: Cue): void {
  const voices = cue.parts.filter((p) => p.kind === 'voice');
  const sfx = cue.parts.filter((p) => p.kind === 'sfx');
  const statics = cue.parts.filter((p) => p.kind === 'static');
  const inputs = [...voices.map(() => `${TAKES_DIR}/${cue.id}.flac`), ...sfx.map((p) => p.file), NOISE];
  const noiseIn = inputs.length - 1;
  const chains: string[] = [];
  const labels: string[] = [];

  const band = cue.band ?? BAND;
  voices.forEach((v, i) => {
    const crush = cue.crushBits ? `,acrusher=bits=${cue.crushBits}:mix=0.5` : '';
    const drive = (v.db ?? 0) + (cue.driveDb ?? 0);
    chains.push(
      `[${i}]aresample=${RATE},aformat=channel_layouts=mono,${band},${COMPRESS},volume=${drive}dB,asoftclip=type=tanh${crush},${band},${delay(v.at)}[v${i}]`,
    );
    labels.push(`[v${i}]`);
  });
  sfx.forEach((p, i) => {
    const input = voices.length + i;
    chains.push(
      `[${input}]aresample=${RATE},aformat=channel_layouts=mono,${band},volume=${p.db}dB,asoftclip=type=tanh,${delay(p.at)}[f${i}]`,
    );
    labels.push(`[f${i}]`);
  });
  chains.push(
    `[${noiseIn}]aresample=${RATE},aformat=channel_layouts=mono,asplit=${statics.length}${statics.map((_, i) => `[n${i}]`).join('')}`,
  );
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
