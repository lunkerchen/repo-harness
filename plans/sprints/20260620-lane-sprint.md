# 结论

**应该集成，但不能把两个 Skill 原样塞进 hook。**

推荐拆成三层：

1. **Hook 热路径**：只做确定性、无网络、无 LLM 的检测与状态记录。
2. **显式 CLI**：负责创建 lane、worktree、完整上下文审计、远程 PR/CI/Review 检查。
3. **Agent Skill**：负责语义判断、任务拆分、审查结论和修复建议。

这符合 `repo-harness` 的核心原则：权威状态保存在仓库文件中，hook 只是加速器和守卫；同时 hook 有 30 秒上限，长期任务应由显式 CLI 执行。([GitHub][1])

---

# 一、应当集成哪些能力

| Skill 能力                             | 集成位置                        |             是否阻断 |
| ------------------------------------ | --------------------------- | ---------------: |
| Threads lane map                     | tracked contract + CLI      |        创建时阻断非法配置 |
| Lane 文件所有权                           | `PreToolUse.edit`           |   活跃多 lane 任务中阻断 |
| Worktree 与 lane 绑定                   | CLI + `PreToolUse.edit`     |           严格模式阻断 |
| Worker 交付证据                          | `PostToolUse.edit` + `Stop` |      Stop 最多阻断一次 |
| 独立 reviewer 要求                       | 显式 review CLI               |            合并前阻断 |
| GitHub CI、Review Threads、merge state | CLI / CI                    |            合并前阻断 |
| 自动启动子 Agent                          | Agent runtime               |     **不放入 hook** |
| Context 文件变化检测                       | `PostToolUse.edit`          |        只标记 dirty |
| Context 过期提醒                         | `SessionStart`              |               提醒 |
| 高上下文文件写入保护                           | `PreToolUse.edit`           | advice → enforce |
| 完整 16 分上下文审计                         | 显式 CLI + Agent Skill        |            默认不阻断 |
| 自动重写 AGENTS.md、CLAUDE.md             | 显式 apply 命令                 |           必须明确授权 |

`threads` 中最有价值的是 lane map、互斥写入范围、角色权限、证据格式和 merge gate；它明确要求 writable lane 文件范围互斥、reviewer 保持只读、worker 输出证据，并且不能仅凭绿色 CI 或 `MERGEABLE` 判断可合并。([GitHub][2])

`repo-agent-context-audit` 最值得集成的是上下文文件发现、作用域冲突、过期状态和高上下文写入保护；完整语义评分和脚手架生成仍应保持只读优先、显式应用。([GitHub][3])

---

# 二、推荐的运行时架构

## 1. Lane 权威契约

新增 tracked 文件：

```text
tasks/contracts/<task>.lanes.json
```

示例：

```json
{
  "schema_version": 1,
  "run_id": "auth-refresh-20260620",
  "task_contract": "tasks/contracts/auth-refresh.contract.md",
  "mode": "execute_direct",
  "goal": "完成认证刷新流程重构",
  "base_ref": "origin/main",
  "merge_policy": "no_merge",
  "verification_owner": "coordinator",
  "limits": {
    "max_writable_lanes": 2,
    "max_reviewers_per_change": 2
  },
  "lanes": [
    {
      "id": "worker-api",
      "role": "worker",
      "status": "ready",
      "depends_on": [],
      "execution_mode": "parallel",
      "branch": "codex/auth-api",
      "write_scopes": [
        "src/auth/",
        "tests/auth/"
      ],
      "forbidden_scopes": [
        "AGENTS.md",
        "CLAUDE.md",
        ".ai/hooks/",
        ".ai/harness/policy.json"
      ],
      "verification_scope": "targeted",
      "required_evidence": [
        "files_changed",
        "commands_run",
        "head_sha",
        "verification"
      ]
    },
    {
      "id": "reviewer-api",
      "role": "reviewer",
      "status": "blocked",
      "depends_on": ["worker-api"],
      "execution_mode": "serial_after_dependency",
      "write_scopes": [],
      "verification_scope": "inspection_only",
      "required_evidence": [
        "findings",
        "commands_run",
        "reviewed_head_sha"
      ]
    }
  ]
}
```

V1 不建议支持任意 glob。使用规范化的文件或目录前缀，并复用 `repo-harness` 已有的“最长前缀匹配、同长度冲突失败”思想，可以让判断简单且确定。

例如：

```text
src/auth/refresh.ts
```

匹配：

```text
src/
src/auth/
```

选择更具体的 `src/auth/`。如果两个 lane 都声明同样具体的前缀，`lanes validate` 直接失败。

---

## 2. 运行时状态

```text
.ai/harness/orchestration/
├── active.json
├── worktree-bindings.json
└── stop-signatures.json

.ai/harness/runs/<run-id>/
├── lane-state.json
├── lane-evidence.json
└── lane-events.jsonl

.ai/harness/context-health/
├── latest.json
├── dirty.json
└── advisory-state.json
```

职责：

* `tasks/contracts/*.lanes.json`：人工和 Agent 可审查的权威契约。
* `active.json`：当前活跃 run 指针。
* `worktree-bindings.json`：worktree、branch 和 lane 的绑定。
* `lane-state.json`：运行状态和实际触碰文件。
* `lane-evidence.json`：worker、reviewer 的交付证据。
* `dirty.json`：哪些改动可能令 Agent 上下文过期。
* `latest.json`：上一次完整上下文审计结果。

`lane-events.jsonl` 默认只保存在本地，不提交；仅在 debug 或显式数据采集模式下启用，避免保存完整 prompt 或敏感内容。

---

# 三、Hook 的具体改造

第一版**不要新增 route tuple**。复用现有的 `SessionStart`、`PreToolUse.edit`、`PreToolUse.subagent`、`PostToolUse.edit`、`UserPromptSubmit` 和 `Stop`。

`repo-harness` 将 `(event, route-id, matcher)` 视为公共适配器契约，而且 route 顺序变化可能触发宿主重新信任。因此第一阶段只修改现有脚本内部行为。([GitHub][4])

## 1. `SessionStart.default`

修改：

```text
assets/hooks/session-start-context.sh
```

新增两个轻量 context block：

```text
# Active Lane
- Run: auth-refresh-20260620
- Lane: worker-api
- Role: worker
- Writable: src/auth/, tests/auth/
- Forbidden: AGENTS.md, CLAUDE.md, .ai/hooks/
- Required evidence: files_changed, commands_run, head_sha, verification

# Context Health
- State: stale
- Reason: package.json changed after the last context audit
- Action: repo-harness context audit --changed
```

约束：

* 只读取已有 JSON。
* 不扫描整个仓库。
* 不调用网络。
* 输出限制在约 1 KB。
* 相同 warning signature 每个审计版本只提示一次。

当前 `SessionStart` 已经聚合 resume、capability、architecture 和其他 context，因此应直接增加一个函数，而不是新增一个独立 hook 进程。([GitHub][5])

---

## 2. `PreToolUse.edit`

修改：

```text
assets/hooks/pre-edit-guard.sh
```

在现有 plan/worktree gate 后增加：

```text
LaneScopeGuard
HighContextWriteGuard
```

判断流程：

```ts
function decideEdit(input: EditInput): Decision {
  const target = canonicalRepoRelativePath(input.filePath);
  const run = loadActiveRun();

  if (!run) {
    return checkHighContextPolicy(target);
  }

  const lane = resolveLaneFromCurrentWorktree(run);

  if (!lane) {
    return policy.lane_scope_gate === "enforce"
      ? block("Active multi-lane run exists, but this worktree is not bound to a lane")
      : advise("Bind this worktree before editing");
  }

  const owner = resolveWriteOwner(target, run.lanes);

  if (!owner) {
    return block(`Path is not assigned to any writable lane: ${target}`);
  }

  if (owner.id !== lane.id) {
    return block(
      `Path belongs to lane ${owner.id}; current lane is ${lane.id}`
    );
  }

  if (matchesForbiddenScope(target, lane)) {
    return block(`Path is forbidden for lane ${lane.id}: ${target}`);
  }

  if (isHighContextPath(target) && !lane.allow_high_context) {
    return block(
      `High-context file requires explicit allow_high_context authorization`
    );
  }

  return allow();
}
```

不要依赖“当前 Agent 名字”识别 lane。最稳妥的身份来源是：

```text
当前 git worktree root
→ worktree-bindings.json
→ lane id
```

这样即使宿主未向 hook 暴露可靠的 subagent ID，文件所有权仍可机械执行。

---

## 3. `PreToolUse.subagent`

修改：

```text
assets/hooks/subagent-return-channel-guard.sh
```

当存在活跃 lane contract 时，验证子 Agent 请求至少包含：

```text
lane_id
role
target
write_scope
forbidden_scope
expected_output
required_evidence
```

第一版只阻止以下危险情况：

* 启动可写 worker，但没有 lane id。
* lane 尚未登记，却给予写权限。
* reviewer 被赋予可写范围。
* 两个活跃 worker 指向同一 worktree。
* worker 请求修改高上下文文件但契约未授权。

不要在这个 hook 中执行 `spawn_agent`。Hook 只能验证宿主即将执行的调度，不能成为调度器本身。

当前运行时已经将 subagent context injection 和不完整结果的一次性重试作为独立生命周期行为；新的 lane contract 应扩展这些能力，而不是建立另一套平行机制。([GitHub][6])

---

## 4. `PostToolUse.edit`

修改：

```text
assets/hooks/post-edit-guard.sh
```

只做两件新增操作：

```text
1. 把本次实际修改路径写入 lane-state.json
2. 根据路径更新 context-health/dirty.json
```

示例：

```json
{
  "schema_version": 1,
  "dirty_since": "2026-06-20T10:20:00-07:00",
  "triggers": [
    {
      "path": "package.json",
      "reason": "command_source_changed"
    },
    {
      "path": "AGENTS.md",
      "reason": "top_level_router_changed"
    }
  ]
}
```

建议触发路径：

```text
AGENTS.md
CLAUDE.md
WARP.md
CONTRIBUTING.md
.github/copilot-instructions.md
.agents/skills/**/SKILL.md
.ai/context/**
.ai/hooks/**
.ai/harness/policy.json
package.json
Makefile
pyproject.toml
Cargo.toml
go.mod
.github/workflows/**
docs/spec.md
docs/reference-configs/**
specs/**/PRODUCT.md
specs/**/TECH.md
```

不要在 PostEdit 中重新计算 16 分评分，也不要启动审计 Agent。现有 PostEdit 本来就执行多项轻量同步，并规定同步失败应告警但不能阻断正常编辑。([GitHub][6])

---

## 5. `Stop.default`

修改：

```text
assets/hooks/stop-orchestrator.sh
```

增加一次性 `LaneEvidenceGate`：

```ts
function decideStop(run: ActiveRun, lane: Lane): Decision {
  const evidence = loadEvidence(run.id, lane.id);
  const missing = lane.requiredEvidence.filter(
    field => !evidence[field]
  );

  if (missing.length === 0) {
    return allow();
  }

  const signature = hash({
    runId: run.id,
    laneId: lane.id,
    missing,
    touchedFiles: evidence.files_changed
  });

  if (alreadyBlocked(signature)) {
    return allowWithWarning();
  }

  recordBlock(signature);

  return block(`
    Lane ${lane.id} is missing closure evidence:
    ${missing.join(", ")}

    Complete with:
    repo-harness lanes close ${lane.id} --evidence <file>
  `);
}
```

只阻断一次，避免 Stop 循环。

Reviewer 的 required evidence 建议为：

```text
reviewed_head_sha
findings
blocking_findings
commands_run
verdict
```

Worker 的 required evidence 建议为：

```text
files_changed
unauthorized_changes
commands_run
head_sha
verification
blockers
```

---

# 四、显式 CLI 设计

## Context 命令

```bash
repo-harness context status
repo-harness context status --json

repo-harness context audit
repo-harness context audit --changed
repo-harness context audit --static --strict
repo-harness context audit --json --write-state

repo-harness context propose
repo-harness context apply --plan <proposal-file>
```

职责分离：

### `context status`

只读取：

```text
current HEAD
latest audit HEAD
dirty.json
```

用于 hook，必须快。

### `context audit --static`

确定性检查：

* 上下文文件 inventory。
* context-map 和 capability 引用是否存在。
* nested instruction scope 是否冲突。
* 同一 scope 是否有多个等优先级 router。
* 文档中声明的脚本是否存在。
* generated/externally owned 文件是否被直接修改。
* 高上下文文件是否过长。
* 上次审计后命令源、CI 或目录结构是否变化。

### `context audit`

生成 evidence packet，并由 Agent 按 Skill rubric 评估：

* routing quality
* progressive disclosure
* workflow quality
* decision gates
* production examples
* spec quality
* validation mapping
* stale/conflict risk

**16 分评分不能作为 hook 硬门槛**，因为其中多数维度需要语义判断。Hook 只可硬阻断客观错误，例如引用不存在、scope 同级冲突、修改生成文件。

---

## Lane 命令

```bash
repo-harness lanes create \
  --contract tasks/contracts/auth-refresh.contract.md \
  --output tasks/contracts/auth-refresh.lanes.json

repo-harness lanes validate \
  tasks/contracts/auth-refresh.lanes.json

repo-harness lanes activate \
  tasks/contracts/auth-refresh.lanes.json

repo-harness lanes bind worker-api \
  --worktree ../repo-harness-wt-auth-api \
  --branch codex/auth-api

repo-harness lanes status

repo-harness lanes evidence worker-api \
  --from tasks/reviews/auth-api.worker.json

repo-harness lanes close worker-api

repo-harness lanes deactivate
```

Worktree 创建仍然通过显式命令完成，可以复用现有 `contract-worktree.sh`：

```bash
repo-harness lanes worktree create worker-api
```

其内部调用已有 worktree helper，而不是在 hook 中执行 `git worktree add`。

---

## 远程合并门禁

单独新增：

```bash
repo-harness review merge-check --pr 123 --json
```

检查：

```text
git fetch 是否成功
当前 origin/main SHA
PR 当前 head SHA
完整 check rollup
merge state
GraphQL reviewThreads 状态
独立 reviewer evidence
用户是否明确授权 merge
```

输出：

```json
{
  "truth_level": "A",
  "pr": 123,
  "head_sha": "abc123",
  "merge_state": "clean",
  "checks": "passed",
  "review_threads": {
    "unresolved_actionable": 0
  },
  "independent_review": "passed",
  "merge_authorized": false,
  "decision": "ready_but_not_authorized"
}
```

该命令只能由 Agent 显式调用或在 CI 中运行。绝不能由 `SessionStart`、`PostEdit` 或 `Stop` 自动运行。`threads` Skill 对 merge gate 的要求依赖 fresh remote state、当前 head SHA 和 thread-aware review 数据，这天然属于网络操作和较长任务。([GitHub][2])

---

# 五、建议新增的代码结构

```text
src/
├── core/
│   ├── lanes/
│   │   ├── schema.ts
│   │   ├── validate.ts
│   │   ├── ownership-resolver.ts
│   │   ├── worktree-binding.ts
│   │   ├── evidence.ts
│   │   └── state.ts
│   └── context-audit/
│       ├── discover.ts
│       ├── classify.ts
│       ├── static-checks.ts
│       ├── fingerprint.ts
│       ├── dirty-state.ts
│       └── report.ts
├── cli/
│   ├── commands/
│   │   ├── lanes.ts
│   │   ├── context.ts
│   │   └── merge-check.ts
│   └── hook/
│       ├── lane-edit-decision.ts
│       ├── lane-stop-decision.ts
│       └── context-sentinel.ts

assets/hooks/
├── session-start-context.sh
├── pre-edit-guard.sh
├── subagent-return-channel-guard.sh
├── post-edit-guard.sh
└── stop-orchestrator.sh
```

在 `src/cli/hook-entry.ts` 增加轻量入口：

```ts
if (argv[0] === "lane-edit-decide") {
  process.stdout.write(runLaneEditDecision());
  process.exit(0);
}

if (argv[0] === "lane-stop-decide") {
  process.stdout.write(runLaneStopDecision());
  process.exit(0);
}

if (argv[0] === "context-sentinel") {
  process.stdout.write(runContextSentinel());
  process.exit(0);
}
```

不要让 hook 调用完整 Commander CLI。当前 `hook-entry.ts` 就是为了避免每次 tool call 都加载完整命令模块，因此新增 decision engine 也应保持自包含和最小依赖。([GitHub][7])

---

# 六、Policy 配置

在 `.ai/harness/policy.json` 增加：

```json
{
  "lanes": {
    "enabled": true,
    "active_file": ".ai/harness/orchestration/active.json",
    "worktree_bindings_file": ".ai/harness/orchestration/worktree-bindings.json",
    "scope_gate": "advice",
    "closure_gate": "advice",
    "max_writable_lanes": 2,
    "default_high_context_policy": "forbid",
    "unassigned_edit_policy": "block_when_active"
  },
  "context_audit": {
    "latest_file": ".ai/harness/context-health/latest.json",
    "dirty_file": ".ai/harness/context-health/dirty.json",
    "session_advisory": true,
    "high_context_write_gate": "advice",
    "semantic_score_gate": "off",
    "static_strict_findings": [
      "broken_reference",
      "equal_scope_conflict",
      "generated_file_write",
      "path_escape"
    ]
  }
}
```

上线顺序：

```text
off → advice → enforce
```

第一版不要直接把所有下游 repo 切到 enforce。

---

# 七、按 PR 执行的落地顺序

## PR 1：核心 schema 与静态审计

实现：

* `context status`
* `context audit --static`
* `context-health/latest.json`
* `context-health/dirty.json`
* lane schema
* longest-prefix ownership resolver
* `lanes validate`

此 PR 不修改 hook 行为。

验收：

* lane scope 重叠可稳定发现。
* context 引用缺失可稳定发现。
* 无网络、无 Agent 也可运行。
* JSON schema 有版本号和迁移错误信息。

---

## PR 2：Context hook sentinel

修改：

* `post-edit-guard.sh`：标记 dirty。
* `session-start-context.sh`：changed-only 提醒。
* `pre-edit-guard.sh`：高上下文写入 advice。
* `stop-orchestrator.sh`：高上下文已改但未审计时提醒一次。

默认策略：

```json
{
  "high_context_write_gate": "advice"
}
```

验收：

* 普通代码修改不会产生 context warning。
* 修改 `package.json` 后 `dirty.json` 更新。
* 下一次 SessionStart 只提示一次。
* 运行 `context audit --write-state` 后 warning 消失。
* PostEdit 不运行完整仓库扫描。

---

## PR 3：Lane scope enforcement

实现：

* `lanes activate/bind/status/close`
* worktree → lane 解析。
* `LaneScopeGuard`
* 实际 touched files 记录。
* unauthorized changes 记录。
* Stop evidence gate。

默认策略先用：

```json
{
  "scope_gate": "advice",
  "closure_gate": "advice"
}
```

经过 self-host canary 后，将活跃多 lane run 的 `scope_gate` 调整为 `enforce`。

验收场景：

```text
worker-api 修改 src/auth/a.ts                允许
worker-api 修改 src/ui/a.ts                  阻断
worker-api 修改 AGENTS.md                    阻断
reviewer 修改任意业务文件                    阻断
无 active run 的普通单 Agent 修改            行为不变
active run 但 worktree 未绑定                 advice/enforce 符合 policy
```

---

## PR 4：Subagent evidence 与独立 Review

实现：

* subagent 请求中的 lane contract 校验。
* SubagentStart context 注入 lane 角色。
* SubagentStop 检查结构化 evidence。
* reviewer 必须基于 worker 的具体 head SHA。
* 同一 worker 不能充当自己的独立 reviewer。

若当前宿主安装已经支持 `SubagentStart.context` 和 `SubagentStop.quality`，直接扩展现有实现；否则先继续使用 `PreToolUse.subagent` 和 `Stop.default`，不要为了该功能立即改变公共 route contract。([GitHub][6])

---

## PR 5：远程 merge-check

实现：

* `git fetch --prune`
* GitHub REST/GraphQL adapter。
* truth level A/B/C/D。
* current head SHA 检查。
* check rollup。
* review thread 状态。
* explicit merge authorization。

只接入：

```text
显式 CLI
GitHub Actions
Agent 明确调用
```

不接入普通交互式 hook。

---

# 八、测试与验收命令

建议新增：

```text
tests/unit/lane-schema.test.ts
tests/unit/lane-ownership-resolver.test.ts
tests/unit/context-audit-static.test.ts
tests/lane-hook-contracts.test.ts
tests/context-hook-contracts.test.ts
tests/lane-stop-gate.test.ts
tests/merge-check.test.ts
```

同时扩展现有：

```text
tests/hook-runtime.test.ts
tests/hook-contracts.test.ts
tests/scaffold-parity.test.ts
tests/workflow-contract.test.ts
tests/hook-dispatch-diet-report.test.ts
```

完整验证：

```bash
bun test

bun run check:type
bun run check:context-files
bun run check:ci
```

这些都是仓库现有的测试和检查入口。([GitHub][8])

建议设定性能门槛：

```text
PreToolUse.edit 新增逻辑：p95 < 100 ms
PostToolUse.edit 新增逻辑：p95 < 100 ms
SessionStart 新增逻辑：p95 < 200 ms
Stop evidence 检查：p95 < 150 ms
Hook 内网络调用：0
Hook 内 LLM 调用：0
```

状态写入必须使用：

```text
临时文件
→ fsync/close
→ atomic rename
```

JSONL 追加和共享状态更新应复用现有 workflow lock，防止多个 Agent 并发写坏状态。

---

# 九、最终推荐范围

首个稳定版本只上线：

```text
Context dirty sentinel
High-context write advice
Lane schema
Worktree-lane binding
Lane write-scope enforcement
Evidence-bearing Stop gate
```

暂不上线：

```text
Hook 自动 spawn Agent
Hook 自动创建 worktree
Hook 自动运行完整上下文评分
Hook 自动修订 AGENTS.md/CLAUDE.md
Hook 自动 fetch GitHub
Hook 等待 CI
Hook 自动 merge
```

核心原则可以概括为：

> **让 hook 执行“契约”，让 CLI 执行“流程”，让 Agent 执行“判断”。**

这既吸收了两个 Skill 的关键价值，又不会破坏 `repo-harness` 当前轻量、文件化、可恢复的 runtime 设计。

[1]: https://github.com/Ancienttwo/repo-harness "https://github.com/Ancienttwo/repo-harness"
[2]: https://github.com/majiayu000/spellbook/blob/main/skills/threads/SKILL.md "https://github.com/majiayu000/spellbook/blob/main/skills/threads/SKILL.md"
[3]: https://github.com/majiayu000/spellbook/blob/main/skills/repo-agent-context-audit/SKILL.md "https://github.com/majiayu000/spellbook/blob/main/skills/repo-agent-context-audit/SKILL.md"
[4]: https://github.com/Ancienttwo/repo-harness/blob/main/src/cli/hook/route-registry.ts "https://github.com/Ancienttwo/repo-harness/blob/main/src/cli/hook/route-registry.ts"
[5]: https://github.com/Ancienttwo/repo-harness/blob/main/assets/hooks/session-start-context.sh "https://github.com/Ancienttwo/repo-harness/blob/main/assets/hooks/session-start-context.sh"
[6]: https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/docs/reference-configs/hook-operations.md "https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/docs/reference-configs/hook-operations.md"
[7]: https://github.com/Ancienttwo/repo-harness/blob/main/src/cli/hook-entry.ts "https://github.com/Ancienttwo/repo-harness/blob/main/src/cli/hook-entry.ts"
[8]: https://github.com/Ancienttwo/repo-harness/blob/main/package.json "https://github.com/Ancienttwo/repo-harness/blob/main/package.json"
