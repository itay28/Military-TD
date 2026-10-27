import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderCredits, type Manifest } from './credits.ts';

/** Licenses we may ship (docs/assets.md). CC-BY needs an attribution; OFL is for fonts only. */
const LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OFL-1.1'];
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const LICENSE_FILE = /^(licen[cs]e|copying|ofl)(\..+)?$/i;

export interface AssetCheckInput {
  manifest: Manifest;
  /** Repo-relative POSIX paths of every file under `assets/` except `manifest.json`. */
  files: string[];
  /** Current text of CREDITS.md. */
  credits: string;
}

/** Regex for a manifest `files` glob: `**` crosses folders, `*` stays in one. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((lit) => lit.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${body}$`);
}

/** Every file under `dir` as a POSIX path, minus the manifest. */
export function listAssetFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAssetFiles(path));
    else if (path !== 'assets/manifest.json') out.push(path);
  }
  return out.sort();
}

/** Problems that should fail CI; each names the file or entry and the fix. Empty means pass. */
export function checkAssets({ manifest, files, credits }: AssetCheckInput): string[] {
  const errors: string[] = [];
  const covered = (pack: Manifest['packs'][number]): string[] => {
    const globs = pack.files.map(globToRegExp);
    return files.filter((file) => globs.some((glob) => glob.test(file)));
  };

  for (const file of files) {
    if (!manifest.packs.some((pack) => covered(pack).includes(file))) {
      errors.push(
        `${file}: not covered by any entry in assets/manifest.json. Add it to a pack's "files" (or add a pack) per docs/assets.md.`,
      );
    }
  }

  for (const pack of manifest.packs) {
    const own = covered(pack);
    if (!LICENSES.includes(pack.license)) {
      errors.push(
        `manifest entry "${pack.id}": license "${pack.license}" is not allowed (${LICENSES.join(', ')}). Use a pack under an allowed license or drop it.`,
      );
    }
    if (pack.license.startsWith('CC-BY') && !pack.attribution.trim()) {
      errors.push(
        `manifest entry "${pack.id}": ${pack.license} needs a non-empty "attribution". Add the credit line to assets/manifest.json.`,
      );
    }
    if (pack.license === 'OFL-1.1') {
      for (const file of own.filter((f) => !FONT_EXT.test(f) && !LICENSE_FILE.test(posix.basename(f)))) {
        errors.push(
          `${file}: OFL-1.1 (entry "${pack.id}") is for fonts only. Use a CC0 or CC-BY pack for non-font files.`,
        );
      }
    }
    if (!own.some((file) => LICENSE_FILE.test(posix.basename(file)))) {
      errors.push(
        `manifest entry "${pack.id}": no license file among its files. Copy the pack's original License.txt into its folder.`,
      );
    }
  }

  if (credits !== renderCredits(manifest)) {
    errors.push('CREDITS.md is out of date with assets/manifest.json. Run `npm run credits` and commit it.');
  }
  return errors;
}

// CLI entry point: `npm run check:assets`, part of `npm run check` and CI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;
  const errors = checkAssets({
    manifest,
    files: listAssetFiles('assets'),
    credits: readFileSync('CREDITS.md', 'utf8'),
  });
  for (const error of errors) console.error(`✗ ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log(`assets: ${manifest.packs.length} packs OK`);
}
