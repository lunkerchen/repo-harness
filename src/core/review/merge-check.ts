import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export type MergeCheckTruthLevel = 'A' | 'B' | 'C' | 'D';
export type MergeCheckDecision =
  | 'ready_but_not_authorized'
  | 'ready'
  | 'blocked_draft'
  | 'blocked_head_mismatch'
  | 'blocked_checks'
  | 'blocked_review_threads'
  | 'blocked_merge_state'
  | 'blocked_independent_review'
  | 'unknown';

export interface MergeCheckReviewEvidence {
  readonly independent_review?: 'passed' | 'failed' | 'missing';
  readonly reviewer_lane_id?: string;
  readonly worker_lane_id?: string;
  readonly reviewed_head_sha?: string;
  readonly verdict?: string;
}

export interface MergeCheckGithubData {
  readonly url?: string;
  readonly head_sha?: string;
  readonly merge_state?: string;
  readonly is_draft?: boolean;
  readonly checks?: 'passed' | 'failed' | 'pending' | 'unknown';
  readonly unresolved_actionable_threads?: number;
}

export interface MergeCheckReport {
  readonly schema_version: 1;
  readonly truth_level: MergeCheckTruthLevel;
  readonly pr: number;
  readonly repo?: string;
  readonly fetched: boolean;
  readonly fetch_error?: string;
  readonly local_head_sha?: string;
  readonly origin_main_sha?: string;
  readonly head_sha?: string;
  readonly merge_state: string;
  readonly checks: 'passed' | 'failed' | 'pending' | 'unknown';
  readonly review_threads: {
    readonly unresolved_actionable: number | null;
  };
  readonly independent_review: 'passed' | 'failed' | 'missing';
  readonly merge_authorized: boolean;
  readonly decision: MergeCheckDecision;
  readonly blockers: readonly string[];
}

export interface MergeCheckRunner {
  readonly execFileSync?: typeof execFileSync;
}

export interface RunMergeCheckOptions {
  readonly cwd?: string;
  readonly pr: number;
  readonly repo?: string;
  readonly fetch?: boolean;
  readonly authorized?: boolean;
  readonly reviewEvidenceFile?: string;
  readonly githubData?: MergeCheckGithubData;
  readonly runner?: MergeCheckRunner;
}

function runGit(cwd: string, args: readonly string[], runner: MergeCheckRunner): string | undefined {
  try {
    return (runner.execFileSync ?? execFileSync)('git', ['-C', cwd, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

function runGitStrict(cwd: string, args: readonly string[], runner: MergeCheckRunner): { ok: true } | { ok: false; error: string } {
  try {
    (runner.execFileSync ?? execFileSync)('git', ['-C', cwd, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function inferRepoSlug(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return undefined;
  const ssh = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (ssh) return ssh[1];
  const https = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  return https?.[1];
}

function reviewEvidence(file: string | undefined): MergeCheckReviewEvidence {
  if (!file || !existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as MergeCheckReviewEvidence
    : {};
}

function reviewPassed(evidence: MergeCheckReviewEvidence, headSha: string | undefined): boolean {
  if (evidence.independent_review !== 'passed' && evidence.verdict !== 'passed' && evidence.verdict !== 'pass') {
    return false;
  }
  if (evidence.reviewer_lane_id && evidence.worker_lane_id && evidence.reviewer_lane_id === evidence.worker_lane_id) {
    return false;
  }
  if (headSha && evidence.reviewed_head_sha && evidence.reviewed_head_sha !== headSha) {
    return false;
  }
  return true;
}

function githubComplete(data: MergeCheckGithubData | undefined): boolean {
  return Boolean(
    data?.head_sha &&
    data.merge_state &&
    data.checks &&
    typeof data.unresolved_actionable_threads === 'number',
  );
}

function decide(report: Omit<MergeCheckReport, 'decision' | 'blockers'>): { decision: MergeCheckDecision; blockers: string[] } {
  const blockers: string[] = [];
  if (!report.head_sha) blockers.push('missing PR head SHA');
  if (report.local_head_sha && report.head_sha && report.local_head_sha !== report.head_sha) {
    blockers.push(`local HEAD ${report.local_head_sha} does not match PR head ${report.head_sha}`);
  }
  if (report.merge_state && !['clean', 'CLEAN', 'has_hooks', 'HAS_HOOKS'].includes(report.merge_state)) {
    blockers.push(`merge state is ${report.merge_state}`);
  }
  if (report.checks !== 'passed') blockers.push(`checks are ${report.checks}`);
  if ((report.review_threads.unresolved_actionable ?? 0) > 0) {
    blockers.push(`${report.review_threads.unresolved_actionable} unresolved actionable review thread(s)`);
  }
  if (report.independent_review !== 'passed') blockers.push('independent reviewer evidence is missing or failed');

  if (blockers.some((entry) => entry.startsWith('local HEAD'))) return { decision: 'blocked_head_mismatch', blockers };
  if (blockers.some((entry) => entry.startsWith('checks'))) return { decision: 'blocked_checks', blockers };
  if (blockers.some((entry) => entry.includes('review thread'))) return { decision: 'blocked_review_threads', blockers };
  if (blockers.some((entry) => entry.startsWith('merge state'))) return { decision: 'blocked_merge_state', blockers };
  if (blockers.some((entry) => entry.startsWith('independent reviewer'))) return { decision: 'blocked_independent_review', blockers };
  if (blockers.length > 0) return { decision: 'unknown', blockers };
  return { decision: report.merge_authorized ? 'ready' : 'ready_but_not_authorized', blockers };
}

export function runMergeCheck(options: RunMergeCheckOptions): MergeCheckReport {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? {};
  const fetchRequested = options.fetch !== false;
  const fetch = fetchRequested ? runGitStrict(cwd, ['fetch', '--prune'], runner) : { ok: false as const, error: 'fetch skipped' };
  const localHead = runGit(cwd, ['rev-parse', 'HEAD'], runner);
  const originMain = runGit(cwd, ['rev-parse', 'origin/main'], runner);
  const repo = options.repo ?? inferRepoSlug(runGit(cwd, ['config', '--get', 'remote.origin.url'], runner));
  const data = options.githubData ?? {};
  const evidence = reviewEvidence(options.reviewEvidenceFile);
  const independentReview: MergeCheckReport['independent_review'] = reviewPassed(evidence, data.head_sha)
    ? 'passed'
    : evidence.independent_review === 'failed' || evidence.verdict === 'failed'
      ? 'failed'
      : 'missing';
  const truthLevel: MergeCheckTruthLevel = githubComplete(data)
    ? fetch.ok
      ? 'A'
      : 'B'
    : localHead || originMain
      ? 'C'
      : 'D';
  const base: Omit<MergeCheckReport, 'decision' | 'blockers'> = {
    schema_version: 1,
    truth_level: truthLevel,
    pr: options.pr,
    repo,
    fetched: fetch.ok,
    fetch_error: fetch.ok ? undefined : fetch.error,
    local_head_sha: localHead,
    origin_main_sha: originMain,
    head_sha: data.head_sha,
    merge_state: data.is_draft === true ? 'draft' : data.merge_state ?? 'unknown',
    checks: data.checks ?? 'unknown',
    review_threads: {
      unresolved_actionable: typeof data.unresolved_actionable_threads === 'number'
        ? data.unresolved_actionable_threads
        : null,
    },
    independent_review: independentReview,
    merge_authorized: options.authorized === true,
  };
  if (data.is_draft === true) {
    return { ...base, decision: 'blocked_draft', blockers: ['pull request is draft'] };
  }
  const decision = decide(base);
  return { ...base, ...decision };
}

export function formatMergeCheck(report: MergeCheckReport, asJson = false): string {
  if (asJson) return JSON.stringify(report, null, 2);
  const lines = [
    `Merge check: ${report.decision}`,
    `Truth level: ${report.truth_level}`,
    `PR: ${report.repo ? `${report.repo}#${report.pr}` : `#${report.pr}`}`,
    `Head: ${report.head_sha ?? '(unknown)'}`,
    `Checks: ${report.checks}`,
    `Review threads unresolved: ${report.review_threads.unresolved_actionable ?? 'unknown'}`,
    `Independent review: ${report.independent_review}`,
    `Merge authorized: ${report.merge_authorized ? 'yes' : 'no'}`,
  ];
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  return lines.join('\n');
}
