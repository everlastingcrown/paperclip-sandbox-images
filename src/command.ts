import { execFileSync } from 'node:child_process';

export type Runner = (command: string, args: string[]) => string;
export const run: Runner = (command, args) => {
  // Never invoke a host shell, including for catalog-provided command strings.
  process.stderr.write(`Running ${command}\n`);
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    }).trim();
  } catch (error) {
    // execFileSync captures stdout even on failure. Surface diagnostic tables
    // (including Trivy findings) before the CLI reports the failed command.
    if (error && typeof error === 'object' && 'stdout' in error) {
      const stdout = error.stdout;
      if (typeof stdout === 'string' || Buffer.isBuffer(stdout))
        process.stderr.write(stdout);
    }
    throw error;
  }
};
