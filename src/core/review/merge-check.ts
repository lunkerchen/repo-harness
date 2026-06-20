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
export type MergeCheckCheckState = 'passed' | 'failed' | 'pending' | 'unknown';
export type MergeCheckRequiredCheckState = MergeCheckCheckState | 'missing';

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
  readonly checks?: MergeCheckCheckState;
  readonly required_checks?: {
    readonly complete?: boolean;
    readonly contexts?: readonly string[];
    readonly statuses?: Readonly<Record<string, MergeCheckRequiredCheckState>>;
    readonly missing?: readonly string[];
    readonly source?: string;
    readonly errors?: readonly string[];
  };
  readonly unresolved_actionable_threads?: number;
  readonly unresolved_actionable_thread_ids?: readonly string[];
  readonly review_threads_complete?: boolean;
  readonly final_head_sha?: string;
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
  readonly final_head_sha?: string;
  readonly merge_state: string;
  readonly checks: MergeCheckCheckState;
  readonly required_checks: {
    readonly state: MergeCheckRequiredCheckState;
    readonly complete: boolean;
    readonly contexts: readonly string[];
    readonly statuses: Readonly<Record<string, MergeCheckRequiredCheckState>>;
    readonly missing: readonly string[];
    readonly source?: string;
    readonly errors: readonly string[];
  };
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
  readonly authorization_actor?: string;
  readonly authorized_at?: string;
  readonly authorization_expires_at?: string;
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
  if (typeof evidence.actor !== 'string' || evidence.actor.trim() === '') return false;
  if (typeof evidence.authorized_at !== 'string' || Number.isNaN(Date.parse(evidence.authorized_at))) return false;
  if (evidence.expires_at) {
    const expiresAt = Date.parse(evidence.expires_at);
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return false;
  }
  return true;
}

function normalizedCheckState(value: unknown): MergeCheckRequiredCheckState {
  return value === 'passed' || value === 'failed' || value === 'pending' || value === 'missing' || value === 'unknown'
    ? value
    : 'unknown';
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((entry) => entry.trim()).filter(Boolean))).sort();
}

function requiredCheckEvidence(data: MergeCheckGithubData | undefined): MergeCheckReport['required_checks'] {
  const evidence = data?.required_checks;
  const contexts = uniqueStrings(evidence?.contexts);
  const sourceStatuses = evidence?.statuses ?? {};
  const statuses: Record<string, MergeCheckRequiredCheckState> = {};
  const missing = new Set(uniqueStrings(evidence?.missing));
  const errors = uniqueStrings(evidence?.errors);
  const complete = evidence?.complete === true && errors.length === 0;

  for (const context of contexts) {
    const state = normalizedCheckState(sourceStatuses[context]);
    statuses[context] = state;
    if (state === 'missing') missing.add(context);
  }

  let state: MergeCheckRequiredCheckState = 'unknown';
  if (complete) {
    if (contexts.length === 0) {
      state = 'passed';
    } else if (Array.from(missing).length > 0) {
      state = 'missing';
    } else if (contexts.some((context) => statuses[context] === 'failed')) {
      state = 'failed';
    } else if (contexts.some((context) => statuses[context] === 'pending')) {
      state = 'pending';
    } else if (contexts.some((context) => statuses[context] === 'unknown')) {
      state = 'unknown';
    } else {
      state = 'passed';
    }
  }

  return {
    state,
    complete,
    contexts,
    statuses,
    missing: Array.from(missing).sort(),
    source: typeof evidence?.source === 'string' && evidence.source.trim() ? evidence.source.trim() : undefined,
    errors,
  };
}

function githubComplete(data: MergeCheckGithubData | undefined): boolean {
  const requiredChecks = requiredCheckEvidence(data);
  return Boolean(
    data?.head_sha &&
    data.merge_state &&
    requiredChecks.complete &&
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
  if (report.final_head_sha && report.head_sha && report.final_head_sha !== report.head_sha) {
    blockers.push(`PR head changed during merge-check: ${report.head_sha} -> ${report.final_head_sha}`);
  }
  if (report.merge_state && !['clean', 'CLEAN', 'has_hooks', 'HAS_HOOKS'].includes(report.merge_state)) {
    blockers.push(`merge state is ${report.merge_state}`);
  }
  if (!report.required_checks.complete) {
    blockers.push('required check evidence is incomplete');
  } else if (report.required_checks.state !== 'passed') {
    const suffix = report.required_checks.missing.length > 0
      ? ` (${report.required_checks.missing.join(', ')})`
      : '';
    blockers.push(`required checks are ${report.required_checks.state}${suffix}`);
  }
  if (!report.review_threads.complete) {
    blockers.push('review thread evidence is incomplete');
  } else if ((report.review_threads.unresolved_actionable ?? 0) > 0) {
    blockers.push(`${report.review_threads.unresolved_actionable} unresolved actionable review thread(s)`);
  }
  if (report.independent_review !== 'passed') blockers.push('independent reviewer evidence is missing or failed');

  if (blockers.some((entry) => entry.startsWith('local HEAD') || entry.startsWith('PR head changed'))) {
    return { decision: 'blocked_head_mismatch', blockers };
  }
  if (blockers.some((entry) => entry.includes('incomplete') || entry.startsWith('truth level'))) {
    return { decision: 'evidence_incomplete', blockers };
  }
  if (blockers.some((entry) => entry.startsWith('required checks'))) return { decision: 'blocked_checks', blockers };
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
  const requiredChecks = requiredCheckEvidence(data);
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
    final_head_sha: data.final_head_sha,
    merge_state: data.is_draft === true ? 'draft' : data.merge_state ?? 'unknown',
    checks: data.checks ?? 'unknown',
    required_checks: requiredChecks,
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
      requiredChecks.complete &&
      threadEvidenceComplete,
    ),
    independent_review: independentReview,
    merge_authorized: mergeAuthorized,
    authorization_source: mergeAuthorized ? 'file' : options.authorized === true ? 'legacy_cli_flag' : undefined,
    authorization_actor: typeof authEvidence.actor === 'string' ? authEvidence.actor : undefined,
    authorized_at: typeof authEvidence.authorized_at === 'string' ? authEvidence.authorized_at : undefined,
    authorization_expires_at: typeof authEvidence.expires_at === 'string' ? authEvidence.expires_at : undefined,
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
    `Required checks: ${report.required_checks.state}`,
    `Review threads unresolved: ${report.review_threads.unresolved_actionable ?? 'unknown'}`,
    `Independent review: ${report.independent_review}`,
    `Merge authorized: ${report.merge_authorized ? 'yes' : 'no'}`,
    `Merge allowed: ${report.merge_allowed ? 'yes' : 'no'}`,
  ];
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  return lines.join('\n');
}
