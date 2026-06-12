# Skill Benchmark Report

Latest iteration: `iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair`

Workspace root: `/Users/chris/Projects/repo-harness-workspace`

Generated: 2026-06-12T03:58:28.813Z

## Quality Metrics

| Metric | Value |
| --- | ---: |
| full_test_count | 1 |
| dry_run_count | 0 |
| dry_run_ratio | 0.0% |
| grader_pass_rate | 100.0% (14/14) |
| effectiveness_authority | authoritative |

Effectiveness evidence is authoritative for this benchmark run.

## Command Matrix

| Agent | Profile | Command |
| --- | --- | --- |
| codex | with_skill | `codex exec -C /Users/chris/Projects/repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/codex/with_skill/route-nl-vs-ts --dangerously-bypass-approvals-and-sandbox -o /Users/chris/Projects/repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/codex/with_skill/route-nl-vs-ts/final-response.md --add-dir /Users/chris/Projects/agentic-dev-wt-loop-engine-03-no-go-router-schema-repair 'Run the route-nl-vs-ts shadow eval for the loop engine. Locate the mounted repo-harness skill root: use .skill-src when it exists, otherwise use .claude/skills/repo-harness. Create .ai/harness/runs/. Write scenarios with `bun "$SKILL_ROOT/scripts/route-nl-vs-ts-eval.ts" --emit-scenarios > .ai/harness/runs/route-nl-vs-ts-scenarios.json`. Read `$SKILL_ROOT/docs/reference-configs/loop-engine-nl-decision-table.md`, then make your own NL decision-table routing choices for every scenario and write `.ai/harness/runs/route-nl-vs-ts-decisions.json` with a top-level `decisions` array of `{scenario_id,intent,action,rationale}` objects. The intent and action fields MUST be exact strings from the scenario pack `allowed_intents` and `allowed_actions` arrays; do not invent synonyms such as enter_done_gate, capture_pending_plan, or scaffold_contract. Do not use `--write-expected-decisions` for the NL arm. Run `bun "$SKILL_ROOT/scripts/route-nl-vs-ts-eval.ts" --agent benchmark --decisions .ai/harness/runs/route-nl-vs-ts-decisions.json --out .ai/harness/runs/route-nl-vs-ts-report.json`. Final response must summarize compliance_rate, false_positive_count, false_negative_count, estimated_token_delta_per_prompt, and go/no-go. Do not edit source files.'` |

## codex / with_skill

| Eval | Status | Exit / Graders | Duration | Changed Files | Raw Artifacts |
| --- | --- | --- | ---: | ---: | --- |
| route-nl-vs-ts | success | 0 / graders pass | 222001ms | 3 | [workspace](../repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/codex/with_skill/route-nl-vs-ts) |

### route-nl-vs-ts

- Eval: `25`
- Workspace: [../repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/codex/with_skill/route-nl-vs-ts](../repo-harness-workspace/iteration-20260612-115446-route-nl-vs-ts-codex-schema-repair/codex/with_skill/route-nl-vs-ts)
- Changed files: `.ai/harness/runs/route-nl-vs-ts-decisions.json`, `.ai/harness/runs/route-nl-vs-ts-report.json`, `.ai/harness/runs/route-nl-vs-ts-scenarios.json`
- Diff summary: .ai/harness/runs/route-nl-vs-ts-decisions.json |  52 ++++++
 .ai/harness/runs/route-nl-vs-ts-report.json    | 233 +++++++++++++++++++++++++
 .ai/harness/runs/route-nl-vs-ts-scenarios.json | 166 ++++++++++++++++++
 3 files changed, 451 insertions(+)
- Agent status: success (exit 0)
- Graders: passed (14/14 passed)
- Final response excerpt: 已完成 `route-nl-vs-ts` shadow eval，使用的 skill root 是 `.skill-src`，没有编辑 source files。 结果： - `compliance_rate`: `100.0%` - `false_positive_count`: `0` - `false_negative_count`: `0` - `estimated_token_delta_per_prompt`: `1393…
- Expectations:
  - Runs the existing TS prompt-guard verdict as the A arm without changing it.
  - Uses the natural-language decision table as the B arm and writes agent-made route decisions.
  - Covers historical route regressions from lessons.md and hook runtime tests.
  - Reports compliance rate, false positives, false negatives, token delta, and go/no-go in .ai/harness/runs/.
  - Keeps classifier cutover out of scope.
- Grader results:
  - PASS files_exist: files_exist: final-response.md
  - PASS files_exist: files_exist: .ai/harness/runs/route-nl-vs-ts-report.json
  - PASS commands_succeed: commands_succeed: skill_root=.skill-src; if [ ! -e "$skill_root/scripts/route-nl-vs-ts-eval.ts" ]; then skill_root=.claude/skills/repo-harness; fi; bun "$skill_root/scripts/route-nl-vs-ts-eval.ts" --check-report .ai/harness/runs/route-nl-vs-ts-report.json
  - PASS files_contain: files_contain: final-response.md =~ route-nl-vs-ts
  - PASS files_contain: files_contain: final-response.md =~ compliance|合规
  - PASS files_contain: files_contain: final-response.md =~ false_positive|误报
  - PASS files_contain: files_contain: final-response.md =~ token_delta|token
  - PASS files_contain: files_contain: final-response.md =~ go|no-go
  - PASS files_contain: files_contain: .ai/harness/runs/route-nl-vs-ts-report.json =~ "protocol": "route-nl-vs-ts/report/v1"
  - PASS files_contain: files_contain: .ai/harness/runs/route-nl-vs-ts-report.json =~ "compliance_rate"
  - PASS files_contain: files_contain: .ai/harness/runs/route-nl-vs-ts-report.json =~ "false_positive_count"
  - PASS files_contain: files_contain: .ai/harness/runs/route-nl-vs-ts-report.json =~ "estimated_token_delta_per_prompt"
  - PASS files_contain: files_contain: .ai/harness/runs/route-nl-vs-ts-report.json =~ "go_no_go"
  - PASS files_not_contain: files_not_contain: final-response.md !~ changed runtime prompt-guard|cutover
