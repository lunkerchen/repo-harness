# `codex/lane-runtime-pr4-pr5` 优化与验收 Checklist

> **Status**: Executing
> **Updated**: 2026-06-21
> **Source Review**: `tasks/reviews/20260621-lane runtime sprint.review.md`

下面是整改与验证计划，不代表这些问题已经在代码中被确认。所有条目应以实际 diff、测试和运行证据为准。

## PRD

Source materials:

- `docs/researches/20260620-repo-harness hook runtime lane report.md`
- `plans/sprints/20260620-lane-sprint.md`
- `tasks/reviews/20260621-lane runtime sprint.review.md`

### Problem

The lane runtime branch introduced context audit/status, hook sentinel, lane scope, subagent reviewer, and review merge-check surfaces, but the review found that several gates could still promote incomplete evidence to merge-ready state.

### Users

- Repo maintainers reviewing `repo-harness` lane-runtime PRs on GitHub.
- Codex/Claude agents executing lane contracts through local hooks and CLI commands.
- Reviewer lanes that must produce independent, head-bound evidence before merge.

### Success Criteria

- PR5 merge-check is conservative: incomplete GitHub evidence, missing independent review evidence, and missing head-bound authorization cannot exit 0.
- PR4 reviewer closure requires a concrete `reviewed_head_sha` on stop/close paths and evidence updates do not lose fields under concurrent writes.
- PR1 context status cannot reuse stale or corrupt cache as clean, and dirty sentinel writes preserve concurrent triggers.
- The branch has a traceable audit record and fresh verification output before it is pushed for GitHub review.

### Acceptance Scenarios

- Running `repo-harness review merge-check` with incomplete GitHub review-thread evidence exits non-zero and reports `evidence_incomplete`.
- Running merge-check with independent review but no explicit head-bound authorization exits non-zero as `ready_but_not_authorized`.
- Reviewer lane stop/close without `reviewed_head_sha` is rejected before lane closure.
- Same-HEAD edits to context files make `context status` stale until a fresh audit is written.
- Concurrent hook dirty-marker and lane evidence writes merge all observed fields instead of last-writer-wins truncation.

## Source PRD

- `docs/researches/20260620-repo-harness hook runtime lane report.md`
- `plans/sprints/20260620-lane-sprint.md`
- `tasks/reviews/20260621-lane runtime sprint.review.md`

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [x] | Establish traceable audit baseline | inline | PR1-PR5 acceptance maps to implementation, tests, commands, and current evidence. | This file plus `tasks/reviews/20260621-lane-runtime-followup.audit.md`. |
| 2 | [x] | Harden PR5 merge-check safety | inline | Incomplete GitHub evidence is conservative, review threads are paginated, unauthorized readiness is non-zero, and merge allowed requires head-bound authorization. | Update `src/core/review/merge-check.ts`, `src/cli/commands/review.ts`, and review tests. |
| 3 | [x] | Harden PR4 reviewer evidence closure | inline | Reviewer stop/close paths require full `reviewed_head_sha`; evidence merges are lock-protected. | Update `src/core/lanes/state.ts` and lane tests. |
| 4 | [x] | Harden context cache and dirty sentinel writes | inline | Same-HEAD context edits make status stale; dirty markers merge concurrent triggers. | Update context audit report and workflow-state hook libs. |
| 5 | [x] | Run full verification and update review branch | inline | Typecheck, targeted tests, full tests, workflow gates, migration dry-run, final status, commit, push. | Verification completed locally; commit/push is the remaining publication step for GitHub review. |

## P0：合并前必须关闭的安全项

### 1. 建立可追溯审计基线

* [ ] 阅读并提取两个目标文档中的逐条 acceptance：

  * `docs/researches/20260620-repo-harness hook runtime lane report.md`
  * `plans/sprints/20260620-lane-sprint.md`
* [ ] 将 PR1–PR5 每条 acceptance 映射到：

  * 实现文件
  * 测试文件
  * 运行验证命令
  * 当前状态
* [ ] 记录目标分支、目标基线和审计 SHA：

  ```bash
  git switch codex/lane-runtime-pr4-pr5
  git status --short
  git rev-parse HEAD
  git merge-base HEAD <target-base>
  git diff --name-status "$(git merge-base HEAD <target-base>)"...HEAD
  ```
* [ ] 分别审查 committed diff、staged diff 和 unstaged diff，避免遗漏本地修改：

  ```bash
  git diff <target-base>...HEAD
  git diff --cached
  git diff
  ```
* [ ] 确认 sprint 总结中的“passed”不能替代代码级 acceptance 证据。

完成标准：每条 acceptance 都能指向具体实现和测试，不存在仅靠总结文本判定通过的项目。

---

## PR1：Context audit/status 静态审计与状态缓存

### 2. 缓存正确性

重点文件：

* `src/cli/commands/context.ts`
* `src/core/context-audit/*`
* `tests/unit/context-audit-static.test.ts`
* `tests/cli/context-lanes.test.ts`

Checklist：

* [ ] 缓存 key 至少包含 repo identity、worktree identity 和审计配置版本。
* [ ] 不仅使用 `HEAD SHA` 作为缓存 key；未提交、未跟踪文件变化也必须使缓存失效。
* [ ] dirty worktree 下不能复用仅基于旧 `HEAD` 产生的 `ok/clean` 结果。
* [ ] 配置文件、hook 文件、lane 文件发生变化时缓存必须失效。
* [ ] 不同 worktree、不同 clone、不同临时测试仓库不能共享同一个状态缓存。
* [ ] 缓存文件损坏、截断、字段缺失或 schema 版本不兼容时，必须重新审计，不能默认通过。
* [ ] 缓存写入采用临时文件加原子 rename，避免并发进程读到半写入 JSON。
* [ ] 多个并发 audit/status 进程不会互相覆盖为错误状态。
* [ ] audit 失败、超时或证据不完整时，不得写入成功缓存。
* [ ] `status ok/clean` 明确区分：

  * 审计成功且没有问题
  * 命中有效缓存
  * 未执行或执行失败
* [ ] 输出中包含缓存命中状态、缓存来源 SHA/fingerprint 和生成时间，便于诊断。

建议补充测试：

* [ ] 同一 `HEAD` 下修改受审计文件，断言不会命中旧缓存。
* [ ] 创建两个 worktree，断言缓存互不污染。
* [ ] 并发运行 10–20 个 `context audit/status`，断言缓存始终可解析。
* [ ] 写入截断 JSON、旧 schema、错误 repo key，断言重新计算。
* [ ] 首次 audit 失败后修复输入，断言不会持续复用失败前状态。

PR1 完成标准：缓存只优化性能，不改变静态审计真值，也不能将未知状态提升为 clean。

---

## PR2：Context hook sentinel

### 3. Sentinel 生命周期和隔离

重点文件：

* `src/cli/hook-entry.ts`
* `src/cli/commands/context.ts`
* `assets/hooks/*`
* `.ai/hooks/*`

Checklist：

* [ ] sentinel 按 repo、worktree、session 或 invocation namespace 隔离。
* [ ] 一个终端或 agent 的 sentinel 不会让另一个并发 session 跳过审计。
* [ ] sentinel 不使用可被任意 repo 共享的固定 `/tmp` 文件名。
* [ ] sentinel 内容绑定当前配置 fingerprint 和受审计状态。
* [ ] `HEAD`、working tree、hook 配置或 lane 配置变化后 sentinel 自动失效。
* [ ] sentinel 文件损坏、权限异常或字段缺失时采用保守行为。
* [ ] hook 被 kill 或异常退出后，不会留下永久有效的“已通过”状态。
* [ ] sentinel 只有在完整审计成功后写入。
* [ ] 测试完成后清理 sentinel，不污染后续测试进程。
* [ ] 测试不会依赖开发机真实 `$HOME/.ai` 状态。

### 4. Hook route 边界

* [ ] sentinel 只挂到设计文档明确指定的 hook event。
* [ ] 未知 hook event 不会意外进入 sentinel、lane 或 review 流程。
* [ ] `review merge-check` 不得注册为普通 interactive hook route。
* [ ] hook entry 不会因为 CLI command import 而自动暴露额外 public route。
* [ ] hook 输入解析失败不能默认为“允许”。

PR2 完成标准：sentinel 不可跨 session 泄漏、不产生永久放行，并且不扩大 public hook surface。

---

## PR3：Lane scope enforcement

### 5. 路径归一化与 scope 优先级

重点文件：

* `src/cli/hook/lane-decision.ts`
* `src/cli/commands/lanes.ts`
* `src/core/lanes/*`
* `tests/lane-hook-contracts.test.ts`
* `tests/unit/*lane*`

Checklist：

* [ ] `forbidden_scope` 优先级高于 `write_scope`。
* [ ] 一个路径同时匹配 allow 和 forbidden 时必须拒绝。
* [ ] 路径在比较前完成统一 separator、`.`、`..` 和绝对路径归一化。
* [ ] 对不存在的目标文件，通过最近存在父目录的 `realpath` 检查 symlink escape。
* [ ] 已存在 symlink 指向 repo 或 lane scope 外部时必须拒绝写入。
* [ ] 目录写入、递归删除和目录移动检查整个操作影响范围。
* [ ] rename/move 同时检查 source 和 destination。
* [ ] 删除路径也受 scope 约束，不能只保护新增和编辑。
* [ ] 大小写不敏感文件系统上不能通过大小写变体绕过。
* [ ] repo root 的相似前缀不能绕过，例如：

  * 允许：`/repo/app`
  * 不允许：`/repo/application-secret`
* [ ] 路径匹配使用 path component 边界，而非简单 `startsWith`。
* [ ] lane scope 为空、格式错误或未知 lane 时采用 fail-closed。
* [ ] 用户提供的 lane metadata 不能覆盖服务端或 runtime 注入的 lane contract。

### 6. Shell 和复合操作绕过

* [ ] 检查 `Write`、`Edit`、`MultiEdit` 等直接文件工具。
* [ ] 检查 shell 重定向：

  * `>`
  * `>>`
  * heredoc
* [ ] 检查 `cp`、`mv`、`rm`、`install`、`tee`、`sed -i`、`perl -pi`。
* [ ] 检查 `git apply`、`patch`、`git checkout -- <path>`、`git restore`。
* [ ] 检查通过 Python、Node 或 Bun 脚本间接写文件的命令。
* [ ] 对无法可靠静态推断写入目标的 opaque shell command，限制性 lane 不得默认允许。
* [ ] 多命令链、subshell、变量展开和 command substitution 不得只检查第一条命令。
* [ ] 不把用户声明的“预计修改文件”当作实际写入范围的唯一依据。

更稳妥的策略：

* [ ] 高风险 lane 中，无法证明写入范围的 shell 操作直接拒绝。
* [ ] 或要求 shell invocation 提交结构化 `affected_paths`，再由 runtime 验证。
* [ ] 若依赖字符串 shell parser，明确记录无法覆盖的语法并设置保守 fallback。

### 7. High-context gate

* [ ] high-context 判定基于实际目标路径，而不是工具描述或 agent 自报。
* [ ] 目标文件经 symlink、rename 或相对路径访问时仍触发 gate。
* [ ] 一次操作包含多个路径时，只要一个属于 high-context 就必须触发 gate。
* [ ] high-context 授权绑定当前 lane、session、repo 和目标路径。
* [ ] 旧授权不能跨分支、跨 worktree 或跨 agent 复用。
* [ ] 解析失败、路径未知时不能跳过 high-context gate。

建议补充测试：

* [ ] `../` traversal。
* [ ] symlink 指向 forbidden scope。
* [ ] allow/deny 重叠。
* [ ] rename 进入 forbidden scope。
* [ ] 目录递归删除。
* [ ] `tee forbidden/file`。
* [ ] `python -c` 写 forbidden file。
* [ ] 一次操作同时修改 allow 和 forbidden path。
* [ ] 空 lane、未知 lane、损坏 lane JSON。
* [ ] Windows separator 或大小写变体，即使 CI 当前运行在 Unix。

PR3 完成标准：不能通过路径表示、symlink、rename、复合 shell 或未知路径规避 write/forbidden/high-context 约束。

---

## PR4：Subagent lane contract 与 independent reviewer

### 8. SubagentStart context 注入

重点文件：

* `src/cli/hook/subagent-lane.ts`
* `src/cli/hook-entry.ts`
* `src/core/lanes/*`
* `tests/subagent-lane-contracts.test.ts`

Checklist：

* [ ] SubagentStart 注入结构化 lane contract，而不是仅拼接自然语言提示。
* [ ] 注入内容至少包括：

  * lane ID
  * role
  * `write_scope`
  * `forbidden_scope`
  * high-context policy
  * parent task/agent identity
  * implementation head SHA
  * evidence schema version
* [ ] runtime contract 与用户 prompt 分离，用户文本不能覆盖 contract 字段。
* [ ] subagent 未获得 lane contract 时，不得默认 unrestricted。
* [ ] reviewer lane 默认为 read-only，不能修改待评审代码或 evidence。
* [ ] reviewer 的 runtime identity 由 hook/runtime 提供，不能由 reviewer 自己填写。

### 9. `reviewed_head_sha` 防绕过

* [ ] `reviewed_head_sha` 是必填字段。
* [ ] 只接受完整、规范化的 commit SHA；空字符串、`null`、`HEAD`、branch name 和通配值均拒绝。
* [ ] evidence 中的 SHA 必须等于审查时目标 head。
* [ ] merge-check 时再次与 GitHub 当前 PR `headRefOid` 比较。
* [ ] 新 commit push 后，旧 reviewer evidence 自动失效。
* [ ] 比较的是 GitHub PR head，而不是本地 checkout SHA。
* [ ] fork PR 场景下仍使用 PR head OID，不误用 base repo local branch。
* [ ] evidence 生成后、merge-check 完成前 head 变化时，整个决定必须重算或拒绝。
* [ ] merge-check 最后再次获取 PR head，防止检查期间发生 TOCTOU 更新。

建议测试：

* [ ] 缺少 `reviewed_head_sha`。
* [ ] 7 位短 SHA。
* [ ] 大小写或空白变体。
* [ ] evidence 对应前一个 commit。
* [ ] 检查期间 PR head 更新。
* [ ] local HEAD 与 GitHub PR head 不同。

### 10. 防止 reviewer 自审

* [ ] implementer identity 和 reviewer identity 来自可信 runtime metadata。
* [ ] 不使用可自由填写的 display name 判断独立性。
* [ ] 比较稳定 agent ID、run ID、spawn identity 或 GitHub actor ID。
* [ ] reviewer agent ID 必须不同于实现 agent ID。
* [ ] reviewer 不能只是同一个 agent 更换 role 字符串。
* [ ] parent agent 不能伪造 reviewer identity。
* [ ] reviewer 若参与过目标 head 的写入或提交，则不计为 independent review。
* [ ] reviewer lane 中发生任何写操作后，review evidence 作废。
* [ ] reviewer evidence 记录 reviewer start/stop 时间和目标 SHA。
* [ ] reviewer 必须在目标 SHA 已产生后启动，避免“预先评审”证据。
* [ ] 同一 reviewer 重放旧 evidence 不能覆盖新 head。
* [ ] 若无法可靠证明 reviewer 独立性，decision 必须降级为 not ready。

### 11. Structured evidence 完整性

建议 evidence 至少包含：

```json
{
  "schema_version": 1,
  "repo": "owner/name",
  "task_id": "...",
  "lane_id": "...",
  "implementer_id": "...",
  "reviewer_id": "...",
  "reviewed_head_sha": "...",
  "verdict": "approve|changes_requested|inconclusive",
  "findings": [],
  "started_at": "...",
  "completed_at": "..."
}
```

Checklist：

* [ ] schema 版本未知时拒绝，不做宽松解释。
* [ ] `approve` 不能在 findings 中存在未关闭 blocker。
* [ ] `inconclusive` 不得满足 independent review acceptance。
* [ ] evidence 文件必须绑定 repo、task 和 lane，不能跨 repo 复用。
* [ ] 重复、冲突 evidence 采用保守决策。
* [ ] evidence 缺字段、字段类型错误、时间异常时拒绝。
* [ ] evidence 存储使用原子写入。
* [ ] 并发 SubagentStop 不会互相覆盖 evidence。
* [ ] evidence 来源和 runtime metadata 不一致时拒绝。

PR4 完成标准：reviewer 不能自报身份、不能复用旧 SHA、不能审查自己的实现，也不能通过缺字段或旧 evidence 满足 acceptance。

---

## PR5：显式 `repo-harness review merge-check`

### 12. CLI 与 hook 边界

重点文件：

* `src/cli/commands/review.ts`
* `src/core/review/merge-check.ts`
* `src/cli/hook-entry.ts`
* `tests/cli/review-merge-check.test.ts`

Checklist：

* [ ] `review merge-check` 只能由显式 CLI invocation 触发。
* [ ] 不注册到普通 PreToolUse、PostToolUse、Stop 或 interactive hook。
* [ ] 不因 import command module 而产生 hook route side effect。
* [ ] 实现中不存在：

  * `gh pr merge`
  * GitHub merge mutation
  * 自动 approve
  * 自动开启 auto-merge
* [ ] 测试对 fake `gh` 调用日志断言：从未执行 merge 命令。

### 13. 缺少 `--repo` 时的 repo 推断

* [ ] 无 `--repo` 时能可靠解析 base repository 的 `owner/name`。
* [ ] 优先使用 GitHub CLI 返回的结构化 repo/PR 数据，而不是手工猜 remote。
* [ ] 支持 SSH、HTTPS、自定义 remote 名和无 `origin` 场景。
* [ ] fork PR 使用 base repository 查询 review threads。
* [ ] repo 推断结果传入 GraphQL owner/name variables。
* [ ] REST/`gh pr view` 成功但 repo 推断失败时，不得跳过 review threads。
* [ ] GraphQL review thread 查询失败时，不得按“没有 unresolved thread”处理。
* [ ] 明确测试无 `--repo` 路径，不能只测试显式 `--repo`。

建议 CLI 测试场景：

* [ ] `--repo owner/name`。
* [ ] 无 `--repo`，当前目录具有标准 origin。
* [ ] 无 `--repo`，只有 upstream remote。
* [ ] SSH remote。
* [ ] fork PR。
* [ ] 不在 git repo 内。
* [ ] `gh repo view` 失败。
* [ ] `gh pr view` 成功但 GraphQL 请求失败。

### 14. GraphQL review thread 完整性

* [ ] 查询所有 review threads，而不是只取第一页。
* [ ] 实现 cursor pagination。
* [ ] 超过 100 个 threads 时仍能找到后续 unresolved thread。
* [ ] 任何页面失败都视为 evidence incomplete。
* [ ] `reviewThreads: null`、权限不足、字段缺失不能解释为空列表。
* [ ] unresolved thread 数量和 thread IDs 可在 JSON 输出中审计。
* [ ] outdated thread、resolved thread、deleted comment 的处理与文档 contract 一致。
* [ ] GraphQL partial errors 即使带有部分 `data`，也不能当作完整证据。
* [ ] rate limit 或 timeout 时 decision 保守降级。

### 15. GitHub head/check/review evidence

* [ ] PR head SHA 来自 GitHub。
* [ ] required checks 与普通非 required checks 明确区分。
* [ ] pending、queued、in_progress、cancelled、timed_out、failure 均阻止 ready。
* [ ] 缺少预期 required check 不能因为“当前列出的 checks 全绿”而通过。
* [ ] required checks API 或 ruleset evidence 无法获取时，truth level 降级。
* [ ] dismissed review、changes requested 和 stale approval 按 contract 处理。
* [ ] approval 是否绑定当前 head 有明确规则。
* [ ] branch protection/ruleset 无权限读取时不能推断为无保护。
* [ ] PR 被关闭、draft、head 不存在或 mergeability unknown 时不能 ready。
* [ ] GitHub API evidence 互相矛盾时阻止 merge。

### 16. Truth level A/B/C/D 保守策略

建议最低安全规则：

* [ ] 只有 truth level A 才可能产生 `merge_allowed: true`。
* [ ] B/C/D 一律不得授权 merge。
* [ ] 任一关键证据缺失时不能保持 A。
* [ ] GraphQL threads 未取全时不能保持 A。
* [ ] required checks 无法确认时不能保持 A。
* [ ] reviewer independence 无法确认时不能保持 A。
* [ ] 当前 head 与 reviewed SHA 不一致时直接 not ready。
* [ ] conflicting evidence 的等级不高于 C。
* [ ] API 完全不可用或结果不可解析时为 D。
* [ ] truth level 与 decision 使用独立字段，避免调用方只看文字。

推荐机器输出：

```json
{
  "truth_level": "A",
  "decision": "ready_but_not_authorized",
  "merge_allowed": false,
  "authorized": false,
  "head_sha": "...",
  "reviewed_head_sha": "...",
  "evidence_complete": true,
  "blocking_reasons": ["explicit_authorization_missing"]
}
```

### 17. `ready_but_not_authorized` exit code

这是自动化误判风险最高的接口之一。

* [ ] 不要让 exit code `0` 同时表示：

  * 命令运行成功
  * 已满足 merge 条件
  * 尚未获得授权
* [ ] 建议只有 `merge_allowed=true` 返回 `0`。
* [ ] 为状态提供稳定、文档化的 exit code：

  * `0`：ready 且明确授权
  * `2`：not ready
  * `3`：ready but not authorized
  * `4`：evidence incomplete / truth unavailable
  * `5`：usage、配置或内部错误
* [ ] shell automation 测试必须证明：

  ```bash
  repo-harness review merge-check && merge-command
  ```

  在 `ready_but_not_authorized` 时不会执行 `merge-command`。
* [ ] 若为了兼容必须保留 exit `0`，则：

  * [ ] 默认模式改为 non-zero；
  * [ ] 仅在显式 `--status-only` 下允许 exit `0`；
  * [ ] JSON 中必须包含 `merge_allowed: false`；
  * [ ] 文档明确禁止使用 exit `0` 作为 merge authorization。
* [ ] 不允许自动化仅根据字符串 `"ready"` 判断合并。

### 18. Explicit authorization 绑定

* [ ] authorization 明确绑定：

  * repo
  * PR number
  * 当前 head SHA
  * authorizing actor
  * 时间或有效期
* [ ] push 新 commit 后 authorization 失效。
* [ ] `--authorize` 不能仅作为任意调用者可添加的布尔开关，除非调用环境本身已可信。
* [ ] authorization 来源在输出中可审计。
* [ ] authorization 缺失时始终 `merge_allowed=false`。
* [ ] authorization 存在但 evidence 不完整时仍然不能 merge。
* [ ] authorization 与 reviewer evidence 不得互相替代。
* [ ] explicit authorization 不触发实际 merge。

PR5 完成标准：只有完整 GitHub 证据、当前 SHA 的独立 review 和明确授权同时成立时才返回 merge allowed；命令永远不执行 merge。

---

## 跨 PR 专项检查

### 19. Public route registry 不得错误扩展

重点检查 `src/cli/hook-entry.ts` 及相关 route definitions。

* [ ] 记录 sprint 前后的 public route 列表。
* [ ] 对 route registry 加精确 snapshot 或 allowlist 测试。
* [ ] PR5 的 `review merge-check` 不出现在 hook route registry。
* [ ] internal helper 不因 export/re-export 被识别为 public route。
* [ ] aliases 不会意外暴露第二套公开入口。
* [ ] unknown route 的返回行为被测试。
* [ ] 测试精确断言 route 名称集合，而非只测试新增 route 可调用。
* [ ] CLI command registry 和 hook route registry 保持物理或逻辑隔离。

完成标准：新增能力没有扩大文档未授权的 hook/public route surface。

### 20. `.ai/hooks` 与 `assets/hooks` 语义一致

* [ ] 确定唯一 canonical source。
* [ ] 最优方案：`.ai/hooks` 由 `assets/hooks` 自动生成或同步，避免双份人工维护。
* [ ] 若必须保留两份，增加 parity test。
* [ ] parity test 不只比较文件名，也比较：

  * event mapping
  * executable command
  * arguments
  * environment variables
  * timeout
  * exit semantics
  * matcher/filter
* [ ] 对允许的路径占位符差异做规范化后再比较。
* [ ] 使用同一组 hook payload 分别执行两份 hook，比较：

  * exit code
  * stdout JSON
  * stderr
  * side effects
* [ ] 安装或 migration 后再次验证 parity。
* [ ] 删除一侧 hook 时测试应失败。
* [ ] 任一侧新增 route 时测试应失败，除非另一侧同步。

完成标准：repo 内运行版本和发布资产版本对相同输入作出相同安全决策。

---

## Migration 与 hook-runtime 稳定性

### 21. 测试状态隔离

重点文件：

* `tests/migration-script.test.ts`
* hook runtime tests
* context/lane/subagent tests

Checklist：

* [ ] 每个测试使用独立临时 repo。
* [ ] 每个测试设置独立：

  * `HOME`
  * `XDG_CONFIG_HOME`
  * `XDG_CACHE_HOME`
  * `TMPDIR`
  * hook state directory
* [ ] 不读取开发机真实 `.ai`、Git config 或 GitHub CLI config。
* [ ] 修改 `process.cwd()`、`process.env` 后在 `finally` 中恢复。
* [ ] 不使用固定缓存文件名或固定 session ID。
* [ ] 不共享 module-level mutable singleton。
* [ ] 测试间不会复用 context audit cache。
* [ ] fake `gh` 的调用日志按 test case 隔离。
* [ ] 测试失败后也清理 lock、sentinel、temporary evidence。
* [ ] 不依赖测试执行顺序。
* [ ] 单独运行和全量运行结果一致。

### 22. 并发与 flaky 验证

* [ ] migration 同一目标连续执行两次，第二次保持幂等。
* [ ] 两个 migration 并发运行，不产生截断或半迁移状态。
* [ ] 多个 hook invocation 并发读取和写入 sentinel/cache。
* [ ] 多个 SubagentStop 并发写 evidence。
* [ ] 多个 merge-check 并发运行不会共享错误 repo/PR 状态。
* [ ] 使用可注入 clock，避免依赖真实毫秒边界。
* [ ] 测试不使用任意 sleep 等待文件状态。
* [ ] 重复运行重点测试至少 20 次：

  ```bash
  for i in $(seq 1 20); do
    bun test tests/migration-script.test.ts || exit 1
    bun test tests/lane-hook-contracts.test.ts || exit 1
    bun test tests/subagent-lane-contracts.test.ts || exit 1
    bun test tests/cli/review-merge-check.test.ts || exit 1
  done
  ```
* [ ] 随机改变测试顺序或分别运行测试文件，确认无顺序依赖。
* [ ] 全量测试前后检查 repo 是否产生未跟踪状态文件：

  ```bash
  git status --short
  ```

完成标准：重复、并发和不同测试顺序下结果稳定，不依赖开发机状态。

---

## 建议新增的 merge-check 决策矩阵测试

至少覆盖以下组合：

* [ ] 全绿、无 unresolved threads、reviewer 独立、SHA 匹配、有授权 → merge allowed。
* [ ] 所有证据完整但无授权 → `ready_but_not_authorized`，非零 exit。
* [ ] reviewer evidence 缺 SHA → not ready。
* [ ] reviewer SHA stale → not ready。
* [ ] reviewer 与 implementer 相同 → not ready。
* [ ] reviewer identity 只在 payload 自报 → not ready。
* [ ] GraphQL review threads 查询失败 → evidence incomplete。
* [ ] GraphQL 返回 partial data + errors → evidence incomplete。
* [ ] 第二页存在 unresolved thread → not ready。
* [ ] required checks API 不可用 → 不得 truth A。
* [ ] check pending/cancelled/timed out → not ready。
* [ ] PR head 在检查过程中变化 → not ready/retry。
* [ ] 无 `--repo` 但能从 GitHub PR 数据推断 repo → review threads 正常查询。
* [ ] 无 `--repo` 且 repo 无法推断 → evidence incomplete，而非默认无 threads。
* [ ] 本地 HEAD 与远端 PR head 不一致 → 使用远端 head。
* [ ] explicit authorization 对应旧 SHA → not authorized。
* [ ] truth B/C/D 即使带 authorization → `merge_allowed=false`。
* [ ] command 全程没有调用 GitHub merge API。

---

## PR1–PR5 最终 Acceptance 表

| PR  | 最低通过条件                                                                   | 状态  |
| --- | ------------------------------------------------------------------------ | --- |
| PR1 | 静态审计结果正确；dirty/untracked/worktree/config 变化使缓存失效；并发写安全                   | [ ] |
| PR2 | sentinel 按 repo/session 隔离；异常不放行；未扩展未授权 hook route                       | [ ] |
| PR3 | write/forbidden/high-context 对 traversal、symlink、rename、shell 和未知路径均不可绕过 | [ ] |
| PR4 | reviewer 身份可信且独立；`reviewed_head_sha` 强校验；旧 evidence 和自审均无效               | [ ] |
| PR5 | 显式 CLI；无自动 merge；无 `--repo` 仍查询完整 threads；不完整证据保守；授权绑定当前 SHA             | [ ] |

---

## 合并前 Definition of Done

* [ ] P0 条目全部关闭。
* [ ] public route registry 精确 allowlist 测试通过。
* [ ] `.ai/hooks` 与 `assets/hooks` parity 测试通过。
* [ ] `ready_but_not_authorized` 不会被 shell `&&` 当作 merge 许可。
* [ ] stale `reviewed_head_sha` 和 reviewer 自审测试通过。
* [ ] symlink、`..`、rename、opaque shell scope bypass 测试通过。
* [ ] 无 `--repo` 的 GraphQL review thread 测试通过。
* [ ] GraphQL pagination 和 partial error 测试通过。
* [ ] context cache 和 sentinel 并发测试通过。
* [ ] migration 重复 20 次无 flaky。
* [ ] 全量测试前后 `git status --short` 均符合预期。
* [ ] 执行并保存最终验证结果：

  ```bash
  bun run check:type
  bun test
  bun test tests/migration-script.test.ts
  bash scripts/check-task-workflow.sh --strict
  ```
* [ ] 最终审计记录包含：

  * base SHA
  * head SHA
  * 测试命令与输出
  * PR1–PR5 acceptance 映射
  * 已接受的剩余风险
  * 明确的 merge authorization 状态

## 建议执行顺序

1. 先修复 reviewer identity、`reviewed_head_sha`、scope bypass 和 merge-check exit semantics。
2. 再补齐无 `--repo` GraphQL、pagination 和 incomplete-evidence 保守决策。
3. 然后处理 cache/sentinel 并发隔离和 hook asset parity。
4. 最后运行重复测试、全量回归并完成 PR1–PR5 acceptance 签字。
