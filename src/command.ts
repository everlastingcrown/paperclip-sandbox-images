import { execFileSync } from 'node:child_process';

export type Runner = (command: string, args: string[]) => string;
export const run: Runner = (command, args) => {
  // Never invoke a host shell, including for catalog-provided command strings.
  process.stderr.write(`Running ${command}\n`);
  return execFileSync(command, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  }).trim();
};
