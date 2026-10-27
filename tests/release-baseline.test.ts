import { describe, expect, it, vi } from 'vitest';
import type { Runner } from '../src/command.js';
import { releaseBaseline } from '../src/release-baseline.js';

const sha = 'a'.repeat(40);
const successful = {
  id: 10,
  event: 'push',
  head_branch: 'main',
  head_sha: sha,
  conclusion: 'success',
};

describe('release baseline selection', () => {
  it('carries failed pushes forward by selecting the preceding successful release', () => {
    const run = vi.fn<Runner>(() => '');
    run.mockReturnValueOnce(
      JSON.stringify({
        workflow_runs: [
          { ...successful, id: 13, conclusion: 'failure' },
          { ...successful, id: 12, conclusion: 'cancelled' },
          { ...successful, id: 11, event: 'workflow_dispatch' },
          successful,
        ],
      }),
    );
    expect(releaseBaseline('example/repo', '14', run)).toBe(sha);
    expect(run).toHaveBeenLastCalledWith('git', [
      'merge-base',
      '--is-ancestor',
      sha,
      'HEAD',
    ]);
  });

  it('accepts scheduled releases and excludes PRs, other branches, and its own run', () => {
    const run = vi.fn<Runner>(() => '');
    run.mockReturnValueOnce(
      JSON.stringify({
        workflow_runs: [
          { ...successful, id: 14 },
          { ...successful, id: 13, event: 'pull_request' },
          { ...successful, id: 12, head_branch: 'feature' },
          { ...successful, event: 'schedule' },
        ],
      }),
    );
    expect(releaseBaseline('example/repo', '14', run)).toBe(sha);
  });

  it('searches beyond a page of successful manual runs', () => {
    const run = vi.fn<Runner>(() => '');
    run.mockReturnValueOnce(
      JSON.stringify({
        workflow_runs: Array.from({ length: 100 }, () => ({
          ...successful,
          event: 'workflow_dispatch',
        })),
      }),
    );
    run.mockReturnValueOnce(JSON.stringify({ workflow_runs: [successful] }));
    expect(releaseBaseline('example/repo', '14', run)).toBe(sha);
    expect(run.mock.calls[1]).toEqual([
      'gh',
      [
        'api',
        'repos/example/repo/actions/workflows/images.yml/runs?branch=main&status=success&per_page=100&page=2',
      ],
    ]);
  });

  it('falls back to a full build when no automatic release exists', () => {
    const run = vi.fn<Runner>(() =>
      JSON.stringify({
        workflow_runs: [{ ...successful, event: 'workflow_dispatch' }],
      }),
    );
    expect(releaseBaseline('example/repo', '14', run)).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('falls back when the latest baseline is missing or outside checkout history', () => {
    const run = vi.fn<Runner>(() => {
      throw new Error('Not an ancestor or missing commit');
    });
    run.mockReturnValueOnce(JSON.stringify({ workflow_runs: [successful] }));
    expect(releaseBaseline('example/repo', '14', run)).toBeUndefined();
  });

  it('stops on API failures instead of using an unverified baseline', () => {
    expect(() =>
      releaseBaseline('example/repo', '14', () => {
        throw new Error('API unavailable');
      }),
    ).toThrow('API unavailable');
  });

  it('rejects malformed baseline commits before invoking git', () => {
    const run = vi.fn<Runner>(() =>
      JSON.stringify({
        workflow_runs: [{ ...successful, head_sha: '--invalid' }],
      }),
    );
    expect(() => releaseBaseline('example/repo', '14', run)).toThrow(
      'Invalid release baseline SHA',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
