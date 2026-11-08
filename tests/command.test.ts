import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/command.js';

afterEach(() => vi.restoreAllMocks());

describe('command diagnostics', () => {
  it('prints captured findings when a command fails', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(() =>
      run(process.execPath, [
        '-e',
        "process.stdout.write('vulnerable package\\n'); process.exitCode = 1;",
      ]),
    ).toThrow();
    expect(stderr).toHaveBeenCalledWith('vulnerable package\n');
  });

  it('returns successful stdout without printing it', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(run(process.execPath, ['-e', "console.log('result')"])).toBe(
      'result',
    );
    expect(stderr).not.toHaveBeenCalledWith('result\n');
  });
});
