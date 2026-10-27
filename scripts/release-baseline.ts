import { appendFileSync } from 'node:fs';
import { run } from '../src/command.js';
import { releaseBaseline } from '../src/release-baseline.js';

const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_OUTPUT } = process.env;
if (!GITHUB_REPOSITORY || !GITHUB_RUN_ID || !GITHUB_OUTPUT)
  throw new Error('Release baseline selection requires a GitHub Actions run');

const base = releaseBaseline(GITHUB_REPOSITORY, GITHUB_RUN_ID, run);
appendFileSync(GITHUB_OUTPUT, `base=${base ?? ''}\n`);
console.log(
  base
    ? `Planning changes since successful release ${base}`
    : 'No usable successful release baseline; rebuilding all images',
);
