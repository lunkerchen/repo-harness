import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export type MergeCheckTruthLevel = 'A' | 'B' | 'C' | 'D';
export type MergeCheckDecision =
  | 'evidence_incomplete'
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
  readonly schema_version?: number;
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
  readonly unresolved_actionable_thread_ids?: readonly string[];
  readonly review_threads_complete?: boolean;
  readonly errors?: readonly string[];
}

export interface MergeCheckAuthorizationEvidence {
  readonly schema_version?: number;
  readonly authorized?: boolean;
  readonly repo?: string;
  readonly pr?: number;
  readonly head_sha?: string;
  readonly actor?: string;
  readonly authorized_at?: string;
  readonly expires_at?: string;
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
    readonly unresolved_actionable_ids: readonly string[];
    readonly complete: boolean;
  };
  readonly reviewed_head_sha?: string;
  readonly evidence_complete: boolean;
  readonly independent_review: 'passed' | 'failed' | 'missing';
  readonly merge_authorized: boolean;
  readonly authorization_source?: 'file' | 'legacy_cli_flag';
  readonly merge_allowed: boolean;
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
  readonly authorizationFile?: string;
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
  const pullUrl = remoteUrl.match(/github\.com[:/]([^/\s]+)\/([^/\s.]+)(?:\.git)?(?:\/pull\/\d+)?/);
  if (pullUrl) return `${pullUrl[1]}/${pullUrl[2].replace(/\.git$/, '')}`;
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

function authorizationEvidence(file: string | undefined): MergeCheckAuthorizationEvidence {
  if (!file || !existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as MergeCheckAuthorizationEvidence
    : {};
}

function isFullSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function reviewPassed(evidence: MergeCheckReviewEvidence, headSha: string | undefined): boolean {
  if (evidence.schema_version !== 1) return false;
  if (evidence.independent_review !== 'passed' && evidence.verdict !== 'passed' && evidence.verdict !== 'pass') {
    return false;
  }
  if (typeof evidence.reviewer_lane_id !== 'string' || evidence.reviewer_lane_id.trim() === '') return false;
  if (typeof evidence.worker_lane_id !== 'string' || evidence.worker_lane_id.trim() === '') return false;
  if (evidence.reviewer_lane_id === evidence.worker_lane_id) return false;
  return isFullSha(headSha) && isFullSha(evidence.reviewed_head_sha) && evidence.reviewed_head_sha === headSha;
}

function authorizationPassed(
  evidence: MergeCheckAuthorizationEvidence,
  repo: string | undefined,
  pr: number,
  headSha: string | undefined,
): boolean {
  if (evidence.schema_version !== 1 || evidence.authorized !== true) return false;
  if (!repo || evidence.repo !== repo || evidence.pr !== pr) return false;
  if (!isFullSha(headSha) || evidence.head_sha !== headSha) return false;
  if (evidence.expires_at && Date.parse(evidence.expires_at) <= Date.now()) return false;
  return true;
}

function githubComplete(data: MergeCheckGithubData | undefined): boolean {
  return Boolean(
    data?.head_sha &&
    data.merge_state &&
    data.checks &&
    typeof data.unresolved_actionable_threads === 'number' &&
    data.review_threads_complete !== false &&
    (!data.errors || data.errors.length === 0),
  );
}

function decide(report: Omit<MergeCheckReport, 'decision' | 'blockers'>): { decision: MergeCheckDecision; blockers: string[] } {
  const blockers: string[] = [];
  if (!report.head_sha) blockers.push('missing PR head SHA');
  if (!report.evidence_complete) blockers.push('required GitHub evidence is incomplete');
  if (report.truth_level !== 'A') blockers.push(`truth level ${report.truth_level} is insufficient for merge authorization`);
  if (report.local_head_sha && report.head_sha && report.local_head_sha !== report.head_sha) {
    blockers.push(`local HEAD ${report.local_head_sha} does not match PR head ${report.head_sha}`);
  }
  if (report.merge_state && !['clean', 'CLEAN', 'has_hooks', 'HAS_HOOKS'].includes(report.merge_state)) {
    blockers.push(`merge state is ${report.merge_state}`);
  }
  if (report.checks !== 'passed') blockers.push(`checks are ${report.checks}`);
  if (!report.review_threads.complete) {
    blockers.push('review thread evidence is incomplete');
  } else if ((report.review_threads.unresolved_actionable ?? 0) > 0) {
    blockers.push(`${report.review_threads.unresolved_actionable} unresolved actionable review thread(s)`);
  }
  if (report.independent_review !== 'passed') blockers.push('independent reviewer evidence is missing or failed');

  if (blockers.some((entry) => entry.startsWith('local HEAD'))) return { decision: 'blocked_head_mismatch', blockers };
  if (blockers.some((entry) => entry.includes('incomplete') || entry.startsWith('truth level'))) {
    return { decision: 'evidence_incomplete', blockers };
  }
  if (blockers.some((entry) => entry.startsWith('checks'))) return { decision: 'blocked_checks', blockers };
  if (blockers.some((entry) => entry.includes('review thread'))) return { decision: 'blocked_review_threads', blockers };
  if (blockers.some((entry) => entry.startsWith('merge state'))) return { decision: 'blocked_merge_state', blockers };
  if (blockers.some((entry) => entry.startsWith('independent reviewer'))) return { decision: 'blocked_independent_review', blockers };
  if (blockers.length > 0) return { decision: 'unknown', blockers };
  return report.merge_authorized
    ? { decision: 'ready', blockers }
    : { decision: 'ready_but_not_authorized', blockers: ['explicit head-bound authorization is missing'] };
}

export function runMergeCheck(options: RunMergeCheckOptions): MergeCheckReport {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? {};
  const fetchRequested = options.fetch !== false;
  const fetch = fetchRequested ? runGitStrict(cwd, ['fetch', '--prune'], runner) : { ok: false as const, error: 'fetch skipped' };
  const localHead = runGit(cwd, ['rev-parse', 'HEAD'], runner);
  const originMain = runGit(cwd, ['rev-parse', 'origin/main'], runner);
  const data = options.githubData ?? {};
  const repo = options.repo
    ?? inferRepoSlug(runGit(cwd, ['config', '--get', 'remote.origin.url'], runner))
    ?? inferRepoSlug(data.url);
  const evidence = reviewEvidence(options.reviewEvidenceFile);
  const authEvidence = authorizationEvidence(options.authorizationFile);
  const independentReview: MergeCheckReport['independent_review'] = reviewPassed(evidence, data.head_sha)
    ? 'passed'
    : evidence.independent_review === 'failed' || evidence.verdict === 'failed'
      ? 'failed'
      : 'missing';
  const threadEvidenceComplete = typeof data.unresolved_actionable_threads === 'number'
    && data.review_threads_complete !== false
    && (!data.errors || data.errors.length === 0);
  const truthLevel: MergeCheckTruthLevel = githubComplete(data)
    ? fetch.ok
      ? 'A'
      : 'B'
    : localHead || originMain
      ? 'C'
      : 'D';
  const mergeAuthorized = authorizationPassed(authEvidence, repo, options.pr, data.head_sha);
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
      unresolved_actionable_ids: data.unresolved_actionable_thread_ids ?? [],
      complete: threadEvidenceComplete,
    },
    reviewed_head_sha: evidence.reviewed_head_sha,
    evidence_complete: Boolean(
      isFullSha(data.head_sha) &&
      data.merge_state &&
      data.checks &&
      threadEvidenceComplete,
    ),
    independent_review: independentReview,
    merge_authorized: mergeAuthorized,
    authorization_source: mergeAuthorized ? 'file' : options.authorized === true ? 'legacy_cli_flag' : undefined,
    merge_allowed: false,
  };
  if (data.is_draft === true) {
    return { ...base, decision: 'blocked_draft', blockers: ['pull request is draft'], merge_allowed: false };
  }
  const decision = decide(base);
  const mergeAllowed = decision.decision === 'ready'
    && base.truth_level === 'A'
    && base.evidence_complete
    && base.independent_review === 'passed'
    && base.merge_authorized;
  return { ...base, ...decision, merge_allowed: mergeAllowed };
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
    `Merge allowed: ${report.merge_allowed ? 'yes' : 'no'}`,
  ];
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  return lines.join('\n');
}
