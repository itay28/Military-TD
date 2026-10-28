import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** One third-party pack in `assets/manifest.json`. Fields and policy: docs/assets.md. */
export interface ManifestEntry {
  id: string;
  name: string;
  author: string;
  /** The original source page, not a re-upload. */
  source: string;
  /** SPDX id, from the allowlist in docs/assets.md. */
  license: string;
  /** Credit line; required for CC-BY, may be empty otherwise. */
  attribution: string;
  /** YYYY-MM-DD. */
  downloaded: string;
  /** Globs of the committed files this entry covers. */
  files: string[];
}

export interface Manifest {
  packs: ManifestEntry[];
}

/** CREDITS.md for `manifest`: one section per pack, in manifest order. */
export function renderCredits(manifest: Manifest): string {
  const lines = [
    '# Credits',
    '',
    'Third-party assets in this game. Generated from `assets/manifest.json` by `npm run credits`; do not edit by hand.',
  ];
  if (manifest.packs.length === 0) lines.push('', 'No third-party assets yet.');
  for (const pack of manifest.packs) {
    lines.push('', `## ${pack.name}`, '');
    lines.push(`- Author: ${pack.author}`);
    lines.push(`- Source: <${pack.source}>`);
    lines.push(`- License: ${pack.license}`);
    if (pack.attribution) lines.push(`- Attribution: ${pack.attribution}`);
    lines.push(`- Downloaded: ${pack.downloaded}`);
    lines.push(`- Files: ${pack.files.map((glob) => `\`${glob}\``).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

// CLI entry point: `npm run credits` regenerates CREDITS.md after a manifest change.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;
  writeFileSync('CREDITS.md', renderCredits(manifest));
  console.log(`CREDITS.md: ${manifest.packs.length} packs`);
}
