/**
 * Builds the weapon sounds (#404): `assets/weapon-sounds/<id>.ogg`, from the CC0 clips committed beside it
 * (`assets/free-firearm-sfx/`, `assets/mikeask-missile/`, `assets/thimras-cannon/`, `assets/ezduzziteh-explosions/`).
 * Every input is in the repo, so a sound can be rebuilt or retuned (ADR-0003 spirit). Needs ffmpeg on the PATH.
 *
 *   node scripts/weapon-fx.ts
 *
 * Each sound is a few layers mixed together: a clip from `at` s, `dur` s long, optionally re-pitched (`rate`, which also
 * changes its length, as a heavier gun's lower report would), filtered and set to `db`. The mortar's incoming whistle is
 * synthesized (band-passed noise falling in pitch), since no CC0 recording of one was found; the explosions add a
 * synthesized sub-bass thump and a debris crackle to their recordings for weight.
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
  /** The clip, or a synthesized source: `whistle` (airy falling shriek), `thump` (sub-bass hit), `crackle` (debris). */
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
  { id: 'mortarWhistle', length: 0.5, layers: [{ file: 'whistle', dur: 0.5, db: 14 }] },
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

/**
 * An incoming bomb's rushing shriek: noise through a broad band-pass (Q 0.9, so a hiss, not a tone) whose centre falls
 * from 3200 to 1400 Hz (the Doppler drop), louder as the bomb closes in.
 */
function whistleSource(dur: number): string {
  const steps = 10;
  const cmds = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (dur * i) / steps;
    return `${t.toFixed(3)} bandpass@w frequency ${Math.round(3200 - (1800 * i) / steps)}`;
  }).join('; ');
  return (
    `anoisesrc=c=pink:r=${RATE}:d=${dur}:a=0.9:seed=404,asendcmd=c='${cmds}',bandpass@w=f=3200:width_type=q:w=0.9,` +
    `volume='0.15+0.85*pow(t/${dur},1.6)':eval=frame`
  );
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

const SYNTH: Record<string, (dur: number) => string> = {
  whistle: whistleSource,
  thump: thumpSource,
  crackle: crackleSource,
};

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
    const synth = SYNTH[layer.file];
    if (synth) args.push('-f', 'lavfi', '-i', synth(layer.dur));
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
