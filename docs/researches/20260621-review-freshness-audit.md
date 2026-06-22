# Review Freshness Audit

Date: 2026-06-21

## P1 Map

System boundary: review-evidence freshness for the existing review/release and
Done paths. The public route tuples stay unchanged: review prompts remain under
`UserPromptSubmit.default`, Done blocking stays in `assets/hooks/prompt-guard.sh`,
and Stop remains owned by `assets/hooks/stop-orchestrator.sh`.

Authoritative surfaces:

- `src/cli/hook/diff-fingerprint.ts` owns implementation diff fingerprints.
- `src/cli/hook-entry.ts review-fingerprint` exposes the light hook CLI path.
- `assets/hooks/prompt-guard.sh` prints current fingerprint metadata during
  review/release prompts and blocks Done when recorded metadata is stale.
- `assets/hooks/lib/workflow-state.sh` reads review metadata and compares it to
  the current fingerprint.
- `assets/hooks/stop-orchestrator.sh` emits a non-blocking stale-review nudge.
- `tasks/reviews/*.review.md` records `Review Rubric Version`, `Reviewed Diff
  Fingerprint`, and `Reviewed Scope`.

Out of scope: running `/check`, editing review files automatically, adding a new
host route, or making minimal-change enforcement blocking.

## P2 Trace

Concrete route:

1. A review/release prompt reaches `prompt-guard.sh`.
2. The existing classifier marks `REVIEW_RELEASE`.
3. `emit_review_fingerprint_prompt` calls
   `repo-harness-hook review-fingerprint --format json`.
4. `diff-fingerprint.ts` hashes branch, staged, unstaged, and untracked
   implementation paths while excluding review/check evidence and hook runtime
   state such as `.ai/harness/handoff/` and failures.
5. The prompt tells the reviewer to record the current fingerprint metadata in
   `tasks/reviews/<slug>.review.md`; peer acceptance guidance carries the same
   metadata.
6. On Done intent, `prompt-guard.sh` verifies contract and review recommendation,
   then `workflow_review_freshness_status` compares the review metadata to the
   current fingerprint before external acceptance and structured checks.
7. Matching fingerprints pass. Missing, pending, or unknown legacy metadata
   warns. Malformed, unknown-current, or stale fingerprints block with
   `ReviewFreshnessGuard`.
8. On Stop, `stop-orchestrator.sh` runs the same comparison and writes only a
   stderr nudge for stale/malformed/unknown states.

The pressure point was self-pollution: Done verification can create harness
runtime files before the freshness comparison. Those paths are excluded so the
guard evaluates implementation drift, not evidence-writing side effects.

## P3 Decision

The design keeps hashing in TypeScript because path sorting, git patch hashing,
and untracked content handling need deterministic byte behavior across shell
hosts. Shell code only reads review metadata and handles host output.

The invariant is compatibility with existing review artifacts. Existing review
files without freshness metadata must not brick completion after upgrade, so
`legacy_missing` is warn-only. Once a review records a real sha256 fingerprint,
staleness is blocking because the review no longer covers the implementation
diff being completed.

At 10x use, the first failure mode would be noisy false stale results from hook
runtime artifacts. The fingerprint therefore excludes review files, checks,
handoff, failures, planning state, and session trace files while still hashing
real implementation paths and untracked file contents.

## Verification

- `bun run check:type`
- `bun test tests/review-freshness.test.ts tests/hook-runtime.test.ts tests/review-rubric.test.ts tests/hook-source-projection.test.ts`
