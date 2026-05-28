# Implementation Notes: hook-global-runtime

> **Status**: Active
> **Plan**: plans/plan-20260528-1436-hook-global-runtime.md
> **Contract**: tasks/contracts/hook-global-runtime.contract.md
> **Review**: tasks/reviews/hook-global-runtime.review.md
> **Last Updated**: 2026-05-28 (post-plan-to-todo, in worktree)
> **Lifecycle**: notes
> **Related**: `tasks/notes/codex-hook-adapter.notes.md` (prior decision: `.codex/hooks.json` is adapter surface; `.ai/hooks/` is implementation)

## Why this note exists

Plan 初稿把 `colbymchenry/codegraph` 当作"已生产验证的范式"对照。Deep-read `_ref/codegraph@02935d77` + 用户实证 + grep `~/.codex/config.toml` 后, 三轮 reframe 固化了真实决策, 避免后续 Phase 0/1 设计跑偏。

## Critical Correction — Codegraph 不验证 `~/.codex/hooks.json`

- **误判**: 以为 codegraph 在生产中证明了 Codex global hook 文件机制可用。
- **真相**: codegraph 是 **MCP server**, 不是 hook runtime。其 `install --target codex --location global` 写 `~/.codex/config.toml` 的 `[mcp_servers.codegraph]` 表 (`_ref/codegraph/src/installer/targets/codex.ts:40,46`), **完全不碰 hooks.json**。它的 git hooks (`src/sync/git-hooks.ts:72-80`) 只是 git post-event 触发 `codegraph sync` 增量索引, 不是通用 hook dispatcher。
- **含义 (第一轮)**: agentic-dev plan 的 Phase 0 canary 不是 "compatibility validation"——是 **first-time discovery**。Codex `~/.codex/hooks.json` 是否被加载完全未知, 需实测。

## What codegraph DOES validate (we can borrow)

| Pattern | Citation | Borrow as |
|---|---|---|
| Multi-target installer with registry | `_ref/codegraph/src/installer/targets/registry.ts:20-29` (8 targets: claude/codex/cursor/opencode/hermes/gemini/antigravity/kiro) | agentic-dev `--target codex|claude|both` 的 registry 结构 |
| `Location = 'global' \| 'local'` type | `_ref/codegraph/src/installer/targets/types.ts:15` | agentic-dev `--location` flag 语义 |
| Per-target `supportsLocation(loc)` | `_ref/codegraph/src/installer/targets/codex.ts:57-59` (Codex 仅 global) | agentic-dev installer 拒绝 `--location local --target codex` |
| `WriteResult { files[], action: 'created'\|'updated'\|'unchanged'\|'removed' }` 幂等模式 | `_ref/codegraph/src/installer/targets/types.ts:51-62` | agentic-dev `install` 输出格式 + 幂等性保证 |
| Bundled Node + multi-arch GitHub Releases via pkg | `_ref/codegraph/package.json` + `install.sh`(3.4K) + `install.ps1`(2.6K) | agentic-dev 分发模式 (替代 Bun runtime 依赖) |
| commander.js CLI 入口 | `_ref/codegraph/package.json:37`, `src/bin/codegraph.ts:111-1722` | agentic-dev CLI library 选型参考 |
| Project init 写 `.gitignore` | `_ref/codegraph/src/storage/directory.ts:84-105` | agentic-dev init 写 `.ai/harness/` 关联 ignore 时的参考 |

## What codegraph does NOT have (agentic-dev 创新)

- **Opt-in marker** — codegraph 直接查 `.codegraph/codegraph.db` 是否存在 (`directory.ts:26-34`); 无 marker 文件层。agentic-dev 的 `.ai/harness/workflow-contract.json` 作为 opt-in marker 是新设计, 需要自己证明其值得。
- **Generic hook dispatcher** — codegraph 的 git hooks 是特用途 (索引同步); agentic-dev 是通用 event→shell exec。这两个 hook 模型只共享"全局安装"层, 语义完全不同。
- **doctor / migrate** — codegraph 无诊断或迁移子命令; agentic-dev 必须自建。
- **多 runtime trust 管理** — codegraph 不在 lifecycle 里处理 Codex trust prompt; agentic-dev plan 必须把"用户首次启用时 trust hooks"作为 install/doctor 必检项。

## Design Decisions (固化)

1. **CLI 实现语言**: 优先 **Bun** (与 repo 工具链一致) 或 **Node + pkg** (直接复用 codegraph install.sh/install.ps1 模式)。**Rust 不再讨论** — codegraph 是 Node, 我们之前误判。
2. **CLI 子命令注册**: 用 **commander.js** (codegraph 同款, 成熟稳定) 或 Bun 的 `parseArgs`, 不引入 yargs/clipanion。
3. **install 输出格式**: 抄 codegraph `WriteResult` 模式, 保证幂等性 + 可机器解析。
4. **target registry**: 模仿 `_ref/codegraph/src/installer/targets/registry.ts` 的 plug-in 结构, 即便 Phase 1 只支持 codex + claude, 也按可扩展形态写。
5. **Codex 仅 global**: install 必须在 `--location local --target codex` 时报错 (Codex 没有项目级 hook 文件概念, 见 `codex.ts:57-59`)。
6. **分发**: GitHub Releases 多 arch binary + `install.sh` curl-bash + `install.ps1` (与 codegraph 模式 1:1 对齐)。
7. **Phase 0 心态 (第一轮)**: 不是验证, 是 discovery。提前准备 hooks.json 不被加载的降级路径。

## External Verification — 第一轮 (2026-05-28)

User flagged 怀疑: "codegraph 不写 hooks.json 可能是历史原因 (开发时 Codex 还没这个 feature), 另外 Claude user-level hooks 也未确认。" 触发两 host 独立查证:

### Codex 侧验证

- **`codex --version`** → `codex-cli 0.130.0` (相对新版本)
- **`codex features list`** 输出含: `hooks stable true` (production-stable feature)
- **`codex --help`**: 没有 `hooks` 子命令; "hook" 仅出现在 untrusted sandbox 说明里
- **`~/.codex/hooks.json`** mtime 2026-04-20, 18B (`{"hooks":{}}`) — 文件由某处生成或用户创建过, 路径形态本身 plausible
- **`~/.codex/log/codex-tui.log`** 753.2MB — Phase 0 canary 可 grep 此找 hook 触发证据
- **结论 (一轮)**: Codex 0.130.0 的 hooks feature 是 production-stable, user-level hooks.json 路径形态存在, 但 **CLI 不提供 hooks 管理子命令** → 暗示 user 要自己写 JSON, 但 docs 没明说 user-level 文件是否被加载。
- **codegraph 不验证此路径的真正原因 (推测)**: codegraph 仓库 history 早于 Codex hooks feature; 它选 `~/.codex/config.toml` MCP 段是当时唯一可用配置面。新版 Codex (≥0.130) 支持 hooks 后 codegraph 没改路径——因为它根本不是 hook runtime, 不需要。

### Claude 侧验证 (via claude-code-guide subagent)

- **`~/.claude/settings.json` 是 documented hooks 路径**: `code.claude.com/docs/en/settings.md` 明确说 user-level 是合法 scope
- **所有 event types 在 user 级都支持**: PreToolUse/PostToolUse/SessionStart/UserPromptSubmit/Stop/Notification/SubagentStart/Stop/FileChanged/ConfigChange (`code.claude.com/docs/en/hooks.md`)
- **Merging precedence (不是 override)**: managed (最高) > local (`.claude/settings.local.json`) > project (`.claude/settings.json`) > user (`~/.claude/settings.json`, 最低)。**同一 event 在两个 scope 都有 hook 时, 两个都会 fire** (merged, not overridden)
- **无 trust re-prompt**: 配置变更自动 reload, 触发 `ConfigChange` event, **不需要重启 Claude Code**
- **未文档化**: 何时引入此 feature 的版本号
- **结论**: Claude 侧 user-level hooks **FULLY SUPPORTED + DOCUMENTED**, 架构可行性已确认

## External Verification — 第二轮 (用户直接提供)

User 直接 reframe: "当前 Codex 生效的主配置文件是 `/Users/ancienttwo/.codex/config.toml`。Hook 功能开关在 `[features] hooks = true`。Hook 配置文件路径规则: 全局 `/Users/ancienttwo/.codex/hooks.json`, 项目级 `<repo>/.codex/hooks.json`。"

### 实证 (grep ~/.codex/config.toml)

- **`[features]` 段** lines 23/138/171 均有 `hooks = true` (config 多 scope 重复声明, 都 true)
- **`[hooks.state]` 段** lines 404+ 存在, 记录 trust hash table
- **当前所有 trust state 都是项目级** path key, 例如:
  - `[hooks.state."/Users/ancienttwo/Astrozi/.codex/hooks.json:post_tool_use:0:0"] trusted_hash = "sha256:2f8aef..."`
  - 17 个 Astrozi hook hash + 17 个 agentic-dev hook hash + 别的项目
- **没有任何 user-level (`/Users/ancienttwo/.codex/hooks.json:...`) 条目** — 原因: 当前 `~/.codex/hooks.json` 是空的 `{"hooks":{}}`, 没有 hook entry → 没有 hash 需要写
- **key 格式是绝对路径**: 一旦 user-level hooks.json 包含真实 hook entry, hash 应自动按相同格式写入 (key 前缀变 `/Users/ancienttwo/.codex/hooks.json:`)

### 含义 (第二轮, 当前)

- **Codex 侧加载路径完全 documented + 实证 supported**, 不再是 unknown
- Phase 0 真正只剩: trust prompt UX 实测 (首次安装时 Codex 是否要求 trust user-level hooks? 接受后 hash 是否真写到 `[hooks.state]`? 改 CLI 调用命令是否重新 trust?)
- **降级路径定义变化**: 从 "loading 不支持的 fallback" 变为 "用户拒绝 trust 时的 fallback" (UX risk, 不是 architecture risk)
- **Phase 0 从 "discovery" 完全降级为 "operational validation"**
- Architecture 风险接近 0; 实施风险变成 "用户首次安装时的 trust UX 是否友好" + "doctor/migrate CLI 边角"

## Deviations From Plan Or Spec

### Phase 0.5 self-migration deferred to Phase 1 (2026-05-28, post-/check)

`/check` 跑 Required Checks 时发现 `.codex/hooks.json` 删除引发 cascade:
- `scripts/check-task-workflow.sh --strict` fail (contract requires)
- `tests/migration-script.test.ts` + `tests/bootstrap-files.test.ts` + `tests/workflow-contract.test.ts` + `tests/init-project.settings.runtime.test.ts` 10+ 处 assert `.codex/hooks.json`
- `scripts/migrate-project-template.sh` 新项目 init 仍生成 `.codex/hooks.json`

正确顺序: Phase 1 task 1B (CLI install/migrate) + 1D (contract `hookRuntime` 字段) 必须同时改 contract/tests/migrate-template。

**Reverted in commit 6070209**:
- `.codex/hooks.json` (从 backup)
- `.claude/settings.json` hooks 段 (从 backup)
- contract 文件 (×2) `.codex/hooks.json` 行
- `scripts/check-task-workflow.sh` `check_required_file` 行

**Kept** (push 到 main):
- `scripts/agentic-dev.sh` + `scripts/hook-shim.sh` (Phase 0.5 deliverables)
- 全局 `~/.codex/hooks.json` + `~/.claude/settings.json` shim 注册 (defer-check → 所有 opt-in repo 用项目级, 无双发)
- plan / notes / contract / todo updates (Phase 1 input)

**Phase 1 必须做**:
- task 1B (CLI install/migrate): migrate 子命令必须把 contract update + test update + migrate-template-script update 一并处理, 单 commit
- task 1D (contract bump): 加 `hookRuntime: { mode: 'global-cli' | 'project-adapter', minCliVersion }` 字段
- task 1G (self-migration): 重做 Phase 0.5, 配合 contract/test/template 同步更新, 用 Phase 1 CLI 跑

## Open Follow-ups

- Phase 0 实测 trust prompt UX 的具体表现 (是否每次 hash change 都重新 prompt? 拒绝 trust 后 hook 行为?)
- CLI hook 调用 + 自身命令 hash 的关系 (Codex 按 command string 做 hash; CLI version change 可能导致 command string 变, 触发 re-prompt)
- 是否在 Phase 1 就支持 `--target both` 一键安装, 或 force user 显式 install 每个 host
- `agentic-dev migrate <repo>` 的默认行为: 直接删 `.codex/hooks.json` 还是改成 fallback shim?

## Bug Fix — `hook_json_get` false-positive WARN (2026-05-28)

观察症状: Claude Code 每次 UserPromptSubmit 都在 stderr 刷一条 `[HookInput] WARN: JSON parse failed for path: .run_id (neither jq nor bun succeeded)`,被外层标成 "hook error"。

根因: `assets/hooks/hook-input.sh` 和 `.ai/hooks/hook-input.sh` 中的 `hook_json_get` 把"JSON 合法但 key 不存在"与"JSON 不可解析"两种 case 用同一条 WARN 表达,触发条件只是 `parsed` 空 + stdin 非空。Claude UserPromptSubmit 载荷字段是 `session_id`/`transcript_path`/`cwd`/`prompt`/`hook_event_name`,**没有 `.run_id`** (Codex 也是按 fallback 链构造 run_id 而非直接传入),所以 `hook_get_run_id` 第一次试 `.run_id` 就稳定撞 WARN。

修复: 新增 `hook_validate_stdin_json` 在首次调用时缓存一次 stdin JSON 合法性 (jq → bun → unknown),`hook_json_get` 只在 JSON 真正不可解析时才 WARN。

新测试: `tests/hook-input-parse.test.ts` 覆盖 4 个 case × 2 份文件 (assets + 自宿主 `.ai/hooks/`)。

## Source Pin

- `_ref/codegraph` clone at commit `02935d77` (2026-05-27), upstream `colbymchenry/codegraph`
- Codex CLI: `codex-cli 0.130.0` (verified 2026-05-28)
- Claude Code: user-level hooks SUPPORTED per `code.claude.com/docs/en/settings.md` (version-introduced undocumented)
- Re-read `_ref/codegraph` 或刷新 host docs 当 codegraph 在 hook/MCP 边界或 host 在 hook 加载机制处有大改动时

## Promotion Candidates

- Promote `codegraph 不是 hook runtime — 别假设 install pattern 复用` to `tasks/lessons.md` 一旦再次出现类似 "看到的方案 → 抽象成模式 → 应用" 失败
- Promote `Codex hooks feature + user-level hooks.json 路径` to `tasks/research.md` Codebase Map 章节 (重要 host fact)
