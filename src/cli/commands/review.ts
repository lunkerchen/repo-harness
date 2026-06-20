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
  for (const remoteName of ['origin', 'upstream']) {
    try {
      const remote = execFileSync('git', ['remote', 'get-url', remoteName], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const slug = inferRepoSlug(remote);
      if (slug) return slug;
    } catch {
      // Try the next remote source.
    }
  }
  try {
    const remotes = execFileSync('git', ['remote', '-v'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const line of remotes.split('\n')) {
      const slug = inferRepoSlug(line);
      if (slug) return slug;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function ghGithubData(pr: number, repo: string | undefined): MergeCheckGithubData | undefined {
  const baseArgs = ['pr', 'view', String(pr), '--json', 'url,headRefOid,mergeStateStatus,isDraft,statusCheckRollup'];
  const prView = ghJson(repo ? [...baseArgs, '--repo', repo] : baseArgs);
  if (!prView) return undefined;
  const prRepo = repo ?? (typeof prView.url === 'string' ? inferRepoSlug(prView.url) : undefined);
  let unresolved: number | undefined;
  const unresolvedIds: string[] = [];
  let reviewThreadsComplete = false;
  const errors: string[] = [];
  if (prRepo?.includes('/')) {
    const [owner, name] = prRepo.split('/');
    const query = 'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{id isResolved} pageInfo{hasNextPage endCursor}}}}}';
    let cursor: string | undefined;
    unresolved = 0;
    for (let page = 0; page < 50; page += 1) {
      const args = [
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
      ];
      if (cursor) args.push('-F', `cursor=${cursor}`);
      const threadData = ghJson(args);
      const rawErrors = (threadData as { errors?: unknown } | undefined)?.errors;
      if (!threadData || (Array.isArray(rawErrors) && rawErrors.length > 0)) {
        errors.push('review thread GraphQL query failed');
        unresolved = undefined;
        break;
      }
      const threads = (((threadData.repository as Record<string, unknown> | undefined)?.pullRequest as Record<string, unknown> | undefined)?.reviewThreads as Record<string, unknown> | undefined);
      const nodes = threads?.nodes;
      const pageInfo = threads?.pageInfo as { hasNextPage?: unknown; endCursor?: unknown } | undefined;
      if (!Array.isArray(nodes) || !pageInfo || typeof pageInfo.hasNextPage !== 'boolean') {
        errors.push('review thread GraphQL response is incomplete');
        unresolved = undefined;
        break;
      }
      for (const node of nodes) {
        const entry = node as { id?: unknown; isResolved?: unknown };
        if (entry.isResolved !== true) {
          unresolved += 1;
          if (typeof entry.id === 'string') unresolvedIds.push(entry.id);
        }
      }
      if (pageInfo.hasNextPage !== true) {
        reviewThreadsComplete = true;
        break;
      }
      if (typeof pageInfo.endCursor !== 'string' || pageInfo.endCursor.trim() === '') {
        errors.push('review thread pagination cursor is missing');
        unresolved = undefined;
        break;
      }
      cursor = pageInfo.endCursor;
    }
  } else {
    errors.push('GitHub repository slug is unavailable for review thread query');
  }
  const finalPrView = ghJson(repo ? [...baseArgs, '--repo', repo] : baseArgs);
  if (!finalPrView) errors.push('final PR head fetch failed');
  return {
    url: typeof prView.url === 'string' ? prView.url : undefined,
    head_sha: typeof prView.headRefOid === 'string' ? prView.headRefOid : undefined,
    final_head_sha: typeof finalPrView?.headRefOid === 'string' ? finalPrView.headRefOid : undefined,
    merge_state: typeof prView.mergeStateStatus === 'string' ? prView.mergeStateStatus.toLowerCase() : undefined,
    is_draft: typeof prView.isDraft === 'boolean' ? prView.isDraft : undefined,
    checks: checksFromRollup(prView.statusCheckRollup),
    unresolved_actionable_threads: unresolved,
    unresolved_actionable_thread_ids: unresolvedIds,
    review_threads_complete: reviewThreadsComplete,
    errors,
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
    .option('--authorization <file>', 'Head-bound merge authorization JSON')
    .option('--authorized', 'Legacy explicit authorization marker; does not allow merge without --authorization')
    .option('--no-fetch', 'Skip git fetch --prune')
    .option('--github-fixture <file>', 'Read GitHub PR evidence from a local JSON fixture')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: {
      pr: string;
      repo?: string;
      reviewEvidence?: string;
      authorization?: string;
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
          authorizationFile: rawOpts.authorization,
          reviewEvidenceFile: rawOpts.reviewEvidence,
          githubData: fixture ?? ghGithubData(pr, repo),
        });
        console.log(formatMergeCheck(report, rawOpts.json === true));
        if (report.merge_allowed) process.exit(0);
        if (report.decision === 'ready_but_not_authorized') process.exit(3);
        if (report.decision === 'evidence_incomplete') process.exit(4);
        process.exit(2);
      } catch (error) {
        const message = (error as Error).message;
        console.log(rawOpts.json === true
          ? JSON.stringify({ schema_version: 1, status: 'fail', error: message }, null, 2)
          : `Merge check failed: ${message}`);
        process.exit(5);
      }
    });

  return review;
}
