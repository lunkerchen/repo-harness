# Task Execution Checklist (Primary)

> **Source Plan**: plans/plan-20260528-1436-hook-global-runtime.md
> **Status**: Executing
> **Generated**: 2026-05-28 14:58 (expanded from plan phases 2026-05-28 15:0X)
> **Source Plan Slug**: hook-global-runtime
> **Review File**: tasks/reviews/hook-global-runtime.review.md
> **Notes File**: tasks/notes/hook-global-runtime.notes.md
> **Capability ID**: root
> **Parent Run ID**: run-20260528-1458
> **Supersedes**: (none)

## Execution

### Phase 0 — Operational Smoke (0.5-1 day, asymmetric scope per notes 第二轮)

- [x] Write `scripts/canary-global-hook.sh` (install / uninstall / status / tail)
- [x] **User**: `bash scripts/canary-global-hook.sh install` (写到 ~/.codex/hooks.json + ~/.claude/settings.json) — 验证: status 显示 codex=5 + claude=5 canary hooks installed
- [x] **User**: 重启 Codex; 观察 trust prompt UX — 2026-05-28T17:03 完成; per-new-entry trust 行为已验证 (5 prompts for 5 new entries, 11 pre-existing shim hashes 静默通过)
- [x] **User**: 重启 Claude Code 或等 ConfigChange auto-reload — 169 user-level claude fires 横跨 1h36m + 含 3 个 SessionStart 证明 auto-reload 工作
- [~] **User**: 触发事件 in 2-3 repos — ✅ opt-in (agentic-dev + Astrozi 各覆盖全 5 events); ⚠ **non-opt-in repo 未测** (剩余 Phase 0 closeout 主要 gap)
- [x] **User**: `bash scripts/canary-global-hook.sh tail` 看 canary 日志条目 — 711 lines, 两 host 都 fire
- [x] **User**: `grep ... ~/.codex/config.toml` 看 `[hooks.state]` user-level 条目 — 16 entries (11 pre-canary shim + 5 canary), key 格式 `<path>:<event-snake>:<i>:<j>` 确认
- [x] **User**: `bash scripts/canary-global-hook.sh status` — 正常输出
- [~] 记录 Operational Matrix 到 `docs/architecture/global-hook-runtime.md` — ✅ Row 1/3 + Trust UX Codex/Claude 主体已 confirmed; 🔶 Row 2/4/5 部分仍 manual-only (prompt 文案截图 / Codex auto-reload 时延 / 拒绝路径行为) — 见 docs 中 5 个 Micro-test 建议
- [ ] **User**: non-opt-in repo manual 测试 — `cd <任一无 .ai/harness/workflow-contract.json 的 repo>`, 触发 PreToolUse (e.g. 编辑文件), 回来 `grep 'repo=<that-repo>' ~/.agentic-dev-canary.log` 应看到新行 (验证 silent-exit-0 不阻止 canary fire)
- [ ] **User**: `bash scripts/canary-global-hook.sh uninstall` 清理 (Phase 0 完成 — 保留 11 pre-canary shim hash 在 config.toml; 仅删除 canary 的 5 个 hash 与 hooks.json entries)

### Phase 1 — CLI 实施 (1-2 weeks)

#### 1A — Scaffold + Types
- [ ] `package.json` 加 bin 字段 + bin entry 路径
- [ ] `src/cli/index.ts` — commander.js 入口, 注册 5 子命令 stubs
- [ ] `src/cli/installer/types.ts` — `Target` / `Location = 'global'|'local'` / `WriteResult { files[], action: created|updated|unchanged|removed }` (参考 `_ref/codegraph/src/installer/targets/types.ts:15,51-62`)
- [ ] `src/cli/installer/targets/registry.ts` — extensible registry (参考 `_ref/codegraph/src/installer/targets/registry.ts:20-29`)
- [ ] `src/cli/installer/targets/codex.ts` — `supportsLocation = loc === 'global'` (参考 `_ref/codegraph/src/installer/targets/codex.ts:57-59`)
- [ ] `src/cli/installer/targets/claude.ts` — `supportsLocation = both`
- [ ] `tests/cli/registry.test.ts` — registry plug-in / lookup

#### 1B — install / hook 核心
- [ ] `src/cli/commands/install.ts` — `--target codex|claude|both --location global` 写 host 各自 global config; WriteResult 输出; 幂等
- [ ] `src/cli/commands/hook.ts` — `agentic-dev hook <event> [args...]`: 解析 repo root → 检测 opt-in (`.ai/harness/workflow-contract.json`) → 找 `<repo>/.ai/hooks/<mapped>.sh` → exec; non-opt-in 静默 exit 0
- [ ] `tests/cli/install.test.ts` — 幂等性 + WriteResult action 正确性 + Codex `--location local` 报错
- [ ] `tests/cli/hook.test.ts` — opt-in detect + non-opt-in exit 0 + 不存在的 hook 报错

#### 1C — status / doctor / migrate
- [ ] `src/cli/commands/status.ts` — CLI version + 两 host install 状态 + 当前 repo opt-in 状态 + hook 覆盖率
- [ ] `src/cli/commands/doctor.ts` — PATH 检测 + CLI version + global adapter 完整性 + trust state (grep `~/.codex/config.toml [hooks.state]`) + fallback paths
- [ ] `src/cli/commands/migrate.ts` — 把旧项目级 `.codex/hooks.json` / `.claude/settings.json` hook 段改为 fallback shim 或删除 (`--dry-run` 默认)

#### 1D — Contract / Template 更新
- [ ] `assets/workflow-contract.v1.json` 加 `hookRuntime: { mode: "global-cli", minCliVersion: "x.y.z" }` 字段 (contract version bump)
- [ ] `.ai/harness/workflow-contract.json` 同步上述 schema (自迁移验证)
- [ ] `scripts/migrate-project-template.sh` — 新项目不再写项目级 `.codex/hooks.json` / `.claude/settings.json` hook 段
- [ ] `scripts/lib/project-init-lib.sh` — 同上
- [ ] `.ai/harness/policy.json` — 加 hookRuntime policy 字段
- [ ] `scripts/check-agent-tooling.sh` — 加 `agentic-dev --version` 检测 + global hook installed 检测
- [ ] `CLAUDE.md` Operating Rules — 加一行 hook runtime 现在是 global CLI
- [ ] `AGENTS.md` 同步

#### 1E — Docs
- [ ] `docs/architecture/global-hook-runtime.md` — 完整版: Host Operational Matrix (Phase 0 输出填入) + Trust UX 章节 + Migration Guide + Failure mode 章节
- [ ] `docs/reference-configs/external-tooling.md` — 加 `agentic-dev` 安装步骤 + Codex/Claude host 配置说明

#### 1F — Distribution (抄 codegraph 模式)
- [ ] `package.json` 加 build 脚本 (pkg 打包 Node 为多 arch binary: darwin/arm64 + darwin/x64 + linux/x64 + linux/arm64)
- [ ] `.github/workflows/release.yml` (或扩展现有) — 自动构建 + 发 GitHub Releases
- [ ] `install.sh` — curl-bash installer (参考 `_ref/codegraph/install.sh`)
- [ ] `install.ps1` — PowerShell installer (参考 `_ref/codegraph/install.ps1`)
- [ ] (可选 Phase 1 后期) Homebrew tap

#### 1G — Self-Migration + 验证
- [ ] 自迁移 agentic-dev 自身: 跑 `agentic-dev install --target both`, 验证现有 hook 行为 (PreToolUse/PostToolUse/SessionStart/UserPromptSubmit/Stop) 仍触发, `.ai/harness/*` 仍正常写入
- [ ] 跨项目验证: 在 1-2 个真实 opt-in repo (例如 Astrozi) 跑 install, 测 hook 行为
- [ ] 非 opt-in repo (任一无 `.ai/harness/workflow-contract.json` 的 repo) 跑 hook 触发, 应静默
- [ ] `bun test` 全部 pass
- [ ] `bash scripts/check-task-sync.sh` pass
- [ ] `bash scripts/check-task-workflow.sh --strict` pass
- [ ] `bun scripts/inspect-project-state.ts --repo . --format text` pass
- [ ] `bash scripts/migrate-project-template.sh --repo . --dry-run` pass
- [ ] `bash scripts/check-agent-tooling.sh --host both` pass

#### 1H — Closeout
- [ ] `tasks/reviews/hook-global-runtime.review.md` — evaluator 填 pass
- [ ] `scripts/verify-sprint.sh` — 跑通
- [ ] `bash scripts/contract-worktree.sh finish --merge` — 合回 main

### Phase 2+ (Future Direction — OUT OF SCOPE)

- (后续 plan) Approach B: sealed hooks (`.ai/hooks/*` + `lib/workflow-state.sh` 下沉到 CLI bundle)
- (后续 plan) Cross-repo task aggregation (`agentic-dev status --all`)
- (后续 plan) MCP server 暴露 workflow state
- (后续 plan) 加 cursor/opencode/gemini 等 target
- (后续 plan) Bun → Rust/Go 语言迁移 (视分发需求)

## Verification (machine + manual, 抄自 plan)

```bash
# === Phase 0 — Operational Smoke ===
bash scripts/canary-global-hook.sh install
# 重启 Codex / Claude, 触发各事件, 观察日志 + trust 行为
bash scripts/canary-global-hook.sh tail
bash scripts/canary-global-hook.sh status
grep "/Users/ancienttwo/.codex/hooks.json" ~/.codex/config.toml   # 看 user-level trust hash
bash scripts/canary-global-hook.sh uninstall

# === Phase 1 — CLI ===
agentic-dev --version
agentic-dev install --target codex --location global
agentic-dev install --target codex --location local   # 应报错 (Codex 仅 global)
agentic-dev install --target claude --location global
agentic-dev install --target both --location global   # 一键安装
agentic-dev install --target both --location global   # 第二次应输出 action=unchanged (幂等)
agentic-dev status
agentic-dev doctor
cd /Users/ancienttwo/Projects/agentic-dev
agentic-dev hook PreToolUse Edit   # 应调用 .ai/hooks/pre-edit-guard.sh
cd <some-non-opt-in-repo>
agentic-dev hook PreToolUse Edit   # 应静默 exit 0
agentic-dev migrate /path/to/some/old-repo --dry-run
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both

# === E2E — 新项目零 hook 配置面 ===
mkdir /tmp/test-new-project && cd /tmp/test-new-project
git init
bash <path-to>/agentic-dev/scripts/migrate-project-template.sh --repo .
test ! -f .codex/hooks.json
test ! -f .claude/settings.json
test -f .ai/harness/workflow-contract.json
# 触发 Edit, 验证 global hook 仍调用 .ai/hooks/post-edit-guard.sh
```
