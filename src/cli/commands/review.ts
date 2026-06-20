import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { Command } from 'commander';
import {
  formatMergeCheck,
  inferRepoSlug,
  runMergeCheck,
  type MergeCheckGithubData,
} from '../../core/review/merge-check';

function readFixture(file: string | undefined): MergeCheckGithubData | undefined {
  if (!file) return undefined;
  if (!existsSync(file)) throw new Error(`merge-check fixture not found: ${file}`);
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as MergeCheckGithubData
    : {};
}

function checksFromRollup(value: unknown): MergeCheckGithubData['checks'] {
  if (!Array.isArray(value)) return 'unknown';
  if (value.length === 0) return 'unknown';
  if (value.some((entry) => {
    const conclusion = String((entry as { conclusion?: unknown })?.conclusion ?? '').toUpperCase();
    const status = String((entry as { status?: unknown })?.status ?? '').toUpperCase();
    return conclusion === 'FAILURE' || conclusion === 'ERROR' || conclusion === 'CANCELLED' || status === 'FAILURE';
  })) return 'failed';
  if (value.some((entry) => {
    const conclusion = String((entry as { conclusion?: unknown })?.conclusion ?? '').toUpperCase();
    const status = String((entry as { status?: unknown })?.status ?? '').toUpperCase();
    return !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(conclusion) && status !== 'COMPLETED';
  })) return 'pending';
  return 'passed';
}

function ghJson(args: readonly string[]): Record<string, unknown> | undefined {
  try {
    const out = execFileSync('gh', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out ? JSON.parse(out) as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function inferRepoFromOrigin(): string | undefined {
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return inferRepoSlug(remote);
  } catch {
    return undefined;
  }
}

function ghGithubData(pr: number, repo: string | undefined): MergeCheckGithubData | undefined {
  const baseArgs = ['pr', 'view', String(pr), '--json', 'url,headRefOid,mergeStateStatus,isDraft,statusCheckRollup'];
  const prView = ghJson(repo ? [...baseArgs, '--repo', repo] : baseArgs);
  if (!prView) return undefined;
  let unresolved: number | undefined;
  if (repo?.includes('/')) {
    const [owner, name] = repo.split('/');
    const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}';
    const threadData = ghJson([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `number=${pr}`,
    ]);
    const nodes = (((threadData?.repository as Record<string, unknown> | undefined)?.pullRequest as Record<string, unknown> | undefined)?.reviewThreads as Record<string, unknown> | undefined)?.nodes;
    if (Array.isArray(nodes)) {
      unresolved = nodes.filter((node) => (node as { isResolved?: unknown }).isResolved !== true).length;
    }
  }
  return {
    url: typeof prView.url === 'string' ? prView.url : undefined,
    head_sha: typeof prView.headRefOid === 'string' ? prView.headRefOid : undefined,
    merge_state: typeof prView.mergeStateStatus === 'string' ? prView.mergeStateStatus.toLowerCase() : undefined,
    is_draft: typeof prView.isDraft === 'boolean' ? prView.isDraft : undefined,
    checks: checksFromRollup(prView.statusCheckRollup),
    unresolved_actionable_threads: unresolved,
  };
}

export function buildReviewCommand(): Command {
  const review = new Command('review')
    .description('Review and merge-readiness helpers');

  review
    .command('merge-check')
    .description('Check PR merge readiness without merging')
    .requiredOption('--pr <number>', 'Pull request number')
    .option('--repo <owner/name>', 'GitHub repository slug; defaults to origin when possible')
    .option('--review-evidence <file>', 'Independent reviewer evidence JSON')
    .option('--authorized', 'Record explicit merge authorization in the decision report')
    .option('--no-fetch', 'Skip git fetch --prune')
    .option('--github-fixture <file>', 'Read GitHub PR evidence from a local JSON fixture')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      pr: string;
      repo?: string;
      reviewEvidence?: string;
      authorized?: boolean;
      fetch?: boolean;
      githubFixture?: string;
      json?: boolean;
    }) => {
      const pr = Number(rawOpts.pr);
      if (!Number.isInteger(pr) || pr <= 0) {
        console.error('repo-harness review merge-check: --pr must be a positive integer');
        process.exit(2);
      }
      try {
        const fixture = readFixture(rawOpts.githubFixture);
        const repo = rawOpts.repo ?? inferRepoFromOrigin();
        const report = runMergeCheck({
          pr,
          repo,
          fetch: rawOpts.fetch !== false,
          authorized: rawOpts.authorized === true,
          reviewEvidenceFile: rawOpts.reviewEvidence,
          githubData: fixture ?? ghGithubData(pr, repo),
        });
        console.log(formatMergeCheck(report, rawOpts.json === true));
        process.exit(report.decision === 'ready' || report.decision === 'ready_but_not_authorized' ? 0 : 1);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true
          ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2)
          : `Merge check failed: ${message}`);
        process.exit(1);
      }
    });

  return review;
}
