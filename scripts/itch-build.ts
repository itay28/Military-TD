import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** itch.io's limits for an HTML5 upload (https://itch.io/docs/creators/html5). MB read as 10^6 bytes, the stricter reading. */
export const ITCH_LIMITS = { maxFiles: 1000, maxPathLength: 240, maxFileBytes: 200e6, maxTotalBytes: 500e6 };

export type ItchLimits = typeof ITCH_LIMITS;

// `src="/x"` or `href='/x'`, but not protocol-relative `//host/x`.
const ROOT_ABSOLUTE = /\b(?:src|href)=(["'])\/(?!\/)[^"']*\1/g;

/** Problems that would stop `dir` working as an itch.io HTML5 upload (ADR-0005). Empty means OK. */
export function checkItchBuild(dir: string, limits: ItchLimits = ITCH_LIMITS): string[] {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return ['No index.html at the root of the build.'];

  const problems: string[] = [];
  for (const [attr] of readFileSync(index, 'utf8').matchAll(ROOT_ABSOLUTE)) {
    problems.push(`index.html uses a root-absolute path: ${attr}. Build with Vite base "./".`);
  }

  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  if (files.length > limits.maxFiles) {
    problems.push(`The build has ${files.length} files; itch.io allows ${limits.maxFiles}.`);
  }

  let total = 0;
  for (const file of files) {
    if (file.length > limits.maxPathLength) {
      problems.push(`${file} is ${file.length} characters long; itch.io allows ${limits.maxPathLength} per path.`);
    }
    const bytes = statSync(join(dir, file)).size;
    total += bytes;
    if (bytes > limits.maxFileBytes) {
      problems.push(`${file} is ${bytes} bytes; itch.io allows ${limits.maxFileBytes} per file.`);
    }
  }
  if (total > limits.maxTotalBytes) {
    problems.push(`The build is ${total} bytes; itch.io allows ${limits.maxTotalBytes} in total.`);
  }
  return problems;
}

// CI entry point: `node scripts/itch-build.ts dist`, run by ci.yml and deploy.yml after the build.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? 'dist';
  const problems = checkItchBuild(dir);
  if (problems.length === 0) {
    console.log(`${dir} fits itch.io's HTML5 limits.`);
  } else {
    console.error(`${dir} won't work on itch.io:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exitCode = 1;
  }
}
