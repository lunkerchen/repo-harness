# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:

## Entries
- Date: 2026-04-19
- Triggered by correction: repo-local hook defaults had drifted back toward generating `.claude/hooks` shims even though the adapter already dispatches directly into `.ai/hooks/run-hook.sh`
- Mistake pattern: preserving a second repo-local hook path after the authoritative hook layer is already clear
- Prevention rule: for repo-local scaffolding, keep `.ai/hooks/` as the only generated hook implementation layer and reserve `.claude/*` for adapter config plus explicit user-owned overrides only
- Where to apply next time: project bootstrap, migration scripts, hook docs, parity tests, and any cleanup that claims to remove compatibility debt

- Date: 2026-04-08
- Triggered by correction: workflow helper inventories and required-path checks had started drifting across multiple shell scripts
- Mistake pattern: repeating contract-critical lists in more than one place
- Prevention rule: promote helper/file/dir inventories into `assets/workflow-contract.v1.json`, then make scripts and tests consume that contract
- Where to apply next time: any new repo-local workflow artifact, helper script, or migration rule

- Date: 2026-04-08
- Triggered by correction: inspection and migration logic missed initialized repos with bundled Skill Factory assets and partial repos with an old `tasks/todo.md`
- Mistake pattern: classifying repo mode from optional feature presence instead of the primary workflow surface, and only testing clean-slate migrations
- Prevention rule: make repo-state routing prefer core workflow surfaces over optional sidecars, and keep fixture coverage for partially migrated repos with legacy content already in canonical paths
- Where to apply next time: any new repo classifier, migration path, or self-hosted routing script
