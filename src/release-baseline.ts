import type { Runner } from './command.js';

interface WorkflowRun {
  id: number;
  event: string;
  head_branch: string;
  head_sha: string;
  conclusion: string | null;
}

// Only automatic releases cover all changes since the preceding baseline.
// Manual selections may publish just part of that history.
export function releaseBaseline(
  repository: string,
  currentRun: string,
  run: Runner,
): string | undefined {
  for (let page = 1; ; page++) {
    const response = JSON.parse(
      run('gh', [
        'api',
        `repos/${repository}/actions/workflows/images.yml/runs?branch=main&status=success&per_page=100&page=${page}`,
      ]),
    ) as { workflow_runs: WorkflowRun[] };
    const baseline = response.workflow_runs.find(
      (candidate) =>
        String(candidate.id) !== currentRun &&
        candidate.head_branch === 'main' &&
        candidate.conclusion === 'success' &&
        ['push', 'schedule'].includes(candidate.event),
    );
    if (baseline) {
      if (!/^[a-f0-9]{40}$/.test(baseline.head_sha))
        throw new Error('Invalid release baseline SHA');
      try {
        // Also rejects missing commits and baselines invalidated by a force push.
        run('git', ['merge-base', '--is-ancestor', baseline.head_sha, 'HEAD']);
      } catch {
        return undefined;
      }
      return baseline.head_sha;
    }
    if (response.workflow_runs.length < 100) return undefined;
  }
}
