/**
 * Builds the weapon sounds (#404): `assets/weapon-sounds/<id>.ogg`, from the CC0 clips committed beside it
 * (`assets/free-firearm-sfx/`, `assets/mikeask-missile/`, `assets/thimras-cannon/`, `assets/ezduzziteh-explosions/`).
 * Every input is in the repo, so a sound can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg on the PATH.
 *
 *   node scripts/weapon-fx.ts
 *
 * Each sound is a few layers mixed together: a clip from `at` s, `dur` s long, optionally re-pitched (`rate`, which also
 * changes its length, as a heavier gun's lower report would), filtered and set to `db`. The mortar's incoming whistle is
 * synthesized (a falling tone), since no CC0 recording of one was found.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

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
  /** The clip, or `whistle` for the synthesized falling tone. */
  readonly file: string | 'whistle';
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
  readonly layers: readonly Layer[];
}

/** Four rounds of an autocannon: a .30-06 report pitched down, as a 23 mm gun's heavier thud, about 6 rounds a second. */
const autocannon: Layer[] = [0, 0.17, 0.34, 0.51].map((delay, i) => ({
  file: RIFLE_30,
  from: 0.1,
  dur: 0.45,
  rate: 0.62,
  delay,
  db: i === 3 ? -2 : 0,
  filter: 'lowpass=f=5000',
}));

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
  { id: 'aaGunBurst', length: 1.1, layers: autocannon },
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
    // A mortar's hollow "thoomp": a cannon shot, low and short.
    id: 'mortarLaunch',
    length: 0.8,
    layers: [{ file: CANNON, dur: 0.6, rate: 0.7, db: -7, filter: 'lowpass=f=700' }],
  },
  { id: 'mortarWhistle', length: 0.5, layers: [{ file: 'whistle', dur: 0.5, db: -6 }] },
  { id: 'mortarBlast', length: 1.5, layers: [{ file: BOOM_MID, dur: 1.5, db: 3 }] },
  {
    // A vehicle destroyed: the big explosion, with extra low end.
    id: 'vehicleExplosion',
    length: 2.2,
    layers: [{ file: BOOM_BIG, dur: 2.2, db: 3, filter: 'bass=g=4:f=90' }],
  },
  // Infantry hit: a short, lighter blast.
  { id: 'infantryHit', length: 0.6, layers: [{ file: BOOM_SMALL, dur: 0.6, db: -4, filter: 'highpass=f=120' }] },
];

/** A falling tone from 1700 to 700 Hz with a little flutter, fading in, as a shell's whistle does. */
function whistleSource(dur: number): string {
  // Phase of a linear sweep f(t) = f0 + (f1 - f0) t / dur, plus a 9 Hz flutter.
  const f0 = 1700;
  const f1 = 700;
  const k = (f1 - f0) / dur;
  const tone = `sin(2*PI*(${f0}*t+${k / 2}*t*t)+0.4*sin(2*PI*9*t))`;
  return `aevalsrc='0.5*${tone}*min(1,t/${dur * 0.6})':s=${RATE}:d=${dur}`;
}

function layerChain(layer: Layer, input: number, label: string): string {
  const parts: string[] = [`[${input}]aresample=${RATE}`, 'aformat=channel_layouts=mono'];
  if (layer.from !== undefined) parts.push(`atrim=start=${layer.from}`, 'asetpts=PTS-STARTPTS');
  if (layer.rate !== undefined) parts.push(`asetrate=${Math.round(RATE * layer.rate)}`, `aresample=${RATE}`);
  parts.push(`atrim=duration=${layer.dur}`, `afade=t=out:st=${Math.max(0, layer.dur - 0.05)}:d=0.05`);
  if (layer.filter) parts.push(layer.filter);
  parts.push(`volume=${layer.db ?? 0}dB`, `adelay=${Math.round((layer.delay ?? 0) * 1000)}:all=1`);
  return `${parts.join(',')}[${label}]`;
}

function build(sound: Sound): void {
  const args: string[] = [];
  sound.layers.forEach((layer) => {
    if (layer.file === 'whistle') args.push('-f', 'lavfi', '-i', whistleSource(layer.dur));
    else args.push('-i', layer.file);
  });
  const chains = sound.layers.map((layer, i) => layerChain(layer, i, `l${i}`));
  const labels = sound.layers.map((_, i) => `[l${i}]`).join('');
  chains.push(
    `${labels}amix=inputs=${sound.layers.length}:normalize=0:duration=longest,` +
      `atrim=end=${sound.length},afade=t=out:st=${sound.length - 0.08}:d=0.08,alimiter=limit=0.9[out]`,
  );
  const out = `${OUT_DIR}/${sound.id}.ogg`;
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y', ...args],
    ...['-filter_complex', chains.join(';'), '-map', '[out]'],
    ...['-ac', '1', '-ar', String(RATE), '-c:a', 'libvorbis', '-q:a', '4', '-map_metadata', '-1', out],
  ]);
  console.log(out);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const sound of SOUNDS) build(sound);
