# lane runtime sprint 严格工程审计

## 审计范围与方法

本次审计基于你指定的分支 `codex/lane-runtime-pr4-pr5`，先阅读了 sprint 目标文档与研究报告，再对当前实现中的关键代码与测试做逐项核对。sprint 文档明确要求：`context status` / `context audit --static` 走显式 CLI；PR2 只在 hook 中做 changed-only 哨兵；PR4 要求 reviewer 必须基于 worker 的具体 `head SHA`，且不能 review 自己；PR5 要求 `review merge-check` 具备 GitHub PR head/check/review thread 状态、truth level A/B/C/D、explicit merge authorization，并且只接显式 CLI / Actions / Agent 明确调用，不接普通交互式 hook。研究报告还明确建议不要新增公共 route tuple，而是在现有链路上增强。 citeturn40view9turn40view7turn40view5turn41view4

从实现面看，`hook-entry.ts` 这次新增的是若干内部 CLI 分支，例如 `lane-edit-decision`、`lane-record-edit`、`lane-stop-decision`、`subagent-start-context`、`subagent-stop-quality`，这些入口都发生在 route 解析之前；我没有看到 `route-registry` 文件被一起改动，因此“不要为了新功能改变公共 route contract”这一点总体上是守住了。 citeturn11view0turn40view7turn41view4

## 主要 findings

- **Blocker — PR5 的 merge-check 在 GitHub 证据不完整时仍可能给出“可 merge”结论，不够保守。**  
  `ghGithubData()` 只有在拿到 `owner/name` 形式的 repo slug 时才会跑 GraphQL `reviewThreads` 查询；否则 `unresolved_actionable_threads` 会留空。随后 `githubComplete()` 只是把 truth level 降级，而 `decide()` 却把 `review_threads.unresolved_actionable === null` 当成“零未解决线程”处理，因为它用的是 `(report.review_threads.unresolved_actionable ?? 0) > 0`。这意味着：一旦 `pr view` 取到了 `head_sha` / `merge_state` / `checks`，但 review thread 状态没取到，最终依然可能落到 `ready` 或 `ready_but_not_authorized`，只不过 truth level 变成了 B/C/D；这直接违背了 sprint 对 “review thread 状态” 和 “truth level/decision 要保守” 的要求。当前测试只覆盖了“能从 origin 推断 repo slug 并去查 review threads”的 happy path，没有覆盖“缺少 `--repo` 且无法推断 repo”或“GraphQL 线程状态缺失”的保守判定。文件与行号：`src/cli/commands/review.ts:634-695`，`src/core/review/merge-check.ts:880-932, 964-1024`，`tests/cli/review-merge-check.test.ts:842-877`。 citeturn20view0turn20view2turn18view2turn23view1turn40view5

- **Blocker — PR5 的 independent review 证据校验过于宽松，`reviewed_head_sha` 与 reviewer/worker lane 身份都可以被绕过。**  
  `reviewPassed()` 只要求 `independent_review === 'passed'` 或 `verdict === 'passed'/'pass'`；只有在 `reviewer_lane_id` 和 `worker_lane_id` **同时存在** 时才检查“不能 self-review”，只有在 `headSha` 和 `evidence.reviewed_head_sha` **同时存在** 时才检查 SHA 不一致。也就是说，像 `{ "independent_review": "passed" }` 这种证据，理论上就会被当作独立 review 通过；而缺少 `reviewed_head_sha` 也不会被判失败。这与 sprint 对“independent review evidence”及“reviewer 必须基于 worker 的具体 head SHA”的要求不一致。当前测试覆盖了 happy path 和“stale reviewed_head_sha”失败，但没有覆盖“缺失 reviewer/worker lane id”或“缺失 reviewed_head_sha”这两类绕过。文件与行号：`src/core/review/merge-check.ts:857-876`，`tests/cli/review-merge-check.test.ts:663-727, 737-832`。 citeturn20view2turn23view0turn22view1turn40view7turn40view5

- **Blocker — `ready_but_not_authorized` 返回 exit code 0，会误导自动化把“未授权仅就绪”当成成功。**  
  CLI 在打印 merge-check 结果后，明确把 `ready` **和** `ready_but_not_authorized` 一起映射为退出码 0。测试也把这一行为固化为了预期：`ready_but_not_authorized` 场景下 `expect(res.status).toBe(0)`。在任何用 `set -e`、Actions step success、或上层脚本只看 exit code 的自动化中，这都会把“尚未显式授权”的状态误判成“通过”。这与 PR5 的 explicit merge authorization 目标相冲突，也会放大自动 merge 误触发的风险。文件与行号：`src/cli/commands/review.ts:756-775`，`tests/cli/review-merge-check.test.ts:663-727`。 citeturn19view7turn23view0turn40view5

- **High — reviewer 的 `reviewed_head_sha` 只在 subagent-evidence 路径上被补强，通用 lane stop / close 路径并没有一致 enforcing。**  
  `effectiveRequiredEvidence()` 会为 reviewer lane 自动追加 `reviewed_head_sha`，这一点是对的；`mergeLaneEvidence()` 与 `laneEvidenceStatus()` 也确实用了这个增强版 required evidence。问题在于，`decideLaneStop()` 仍然直接调用 `missingEvidence(lane, entry, cwd)`，没有套 `effectiveRequiredEvidence(lane)`；`closeLane()` 更是完全不做 evidence completeness 校验，而 `lanes close` 命令无条件 `process.exit(0)`。这意味着 reviewer lane 如果不走 `SubagentStop.quality` 那条路径，而是走通用 stop/close 流程，仍然可以在没有 `reviewed_head_sha` 的情况下完成关闭。当前 unit / hook tests 也没有覆盖 reviewer lane 的 stop/close 证据要求。文件与行号：`src/core/lanes/state.ts:2717-2727, 3222-3285, 2583-2658`，`src/cli/commands/lanes.ts:827-845`，`tests/unit/lane-state.test.ts:492-547`。 citeturn33view2turn38view2turn38view0turn39view0turn36view3turn40view7

- **High — context dirty state 与 lane runtime state 都存在并发丢更新风险，当前测试没有把这个风险打出来。**  
  研究与实现都承认 hook hot path 会并发发生；`hook-entry.ts` 顶部注释也明确写了 “Host hooks run after almost every tool call and may be invoked concurrently”。但 `workflow_context_mark_dirty()` 是典型的“读 dirty.json → 合并 triggers → 写 tmp → rename”流程，没有任何进程间锁或重试合并；两个并发 PostEdit 很容易把彼此的 trigger 覆盖掉。lane state 这边同样如此：`recordLaneEdit()` 与 `mergeLaneEvidence()` 都是“读 lane-state.json → 基于旧快照构造 nextRuntime → `writeJsonAtomic()` 覆盖写回”，而 `writeJsonAtomic()` 只提供 rename 级别的原子替换，不提供并发串行化。因此并发编辑或并发 evidence merge 时，`touched_files`、`unauthorized_changes`、`evidence` 都存在 lost update 风险。测试侧我没有看到任何 parallel / `Promise.all` / 并发 hook case。文件与行号：`src/cli/hook-entry.ts:446-454`，`.ai/hooks/lib/workflow-state.sh:2442-2518`，`src/core/lanes/state.ts:2171-2179, 2984-3064, 3080-3145`，`tests/unit/lane-state.test.ts` 中无并行覆盖。 citeturn11view0turn30view0turn30view1turn30view2turn31view1turn18view0turn18view1turn31view4turn31view5turn40view9

- **Medium — review thread GraphQL 查询只取前 100 条，没有分页，超大 PR 会低估未解决线程数。**  
  GraphQL query 写死为 `reviewThreads(first:100)`，后续直接对返回 nodes 计数，没有 `pageInfo`、`hasNextPage`、`endCursor` 或循环翻页逻辑。对于 review thread 很多的大 PR，这会让“第 101 条之后的 unresolved thread”完全不可见。文件与行号：`src/cli/commands/review.ts:647-676`。 citeturn20view0turn40view5

## PR acceptance 判断

**PR1：部分满足。**  
`context status`、`context audit --static`、`latest.json` / `dirty.json`、lane schema、ownership resolver、`lanes validate` 都已经落地，而且 `context status` 只读 cached state、`context audit` 走显式 CLI，与 sprint 设计一致。问题在于 `dirty.json` 的更新在并发 hook 下有丢 trigger 风险，因此“状态缓存”这一部分还不够工程化。 citeturn14view2turn40view9turn30view0turn30view1turn30view2

**PR2：部分满足。**  
`post-edit-guard` 标 dirty、`session-start-context` 做 changed-only 提示、`pre-edit-guard` 做 high-context write advice 这些主路径都在；而且 session-start 也用了 rendered marker 来做到“同一签名只提示一次”。但 dirty state 写入没有并发保护，意味着 changed-only sentinel 的底层状态源可能丢更新。 citeturn23view4turn26view1turn35view1turn35view3turn30view0turn30view2

**PR3：基本满足。**  
从静态阅读看，`write_scope`、`forbidden_scope`、`high-context gate` 的主判定链路是完整的：路径先做 repo-relative 规范化，再用 longest-prefix ownership 解析 owner，随后检查 wrong-lane、forbidden scopes、以及 `allow_high_context`。现有 hook contract tests 也覆盖了 owned/wrong-lane/forbidden/reviewer/unbound 几类核心情形。我没有发现一个明确的逻辑绕过点。剩余问题主要是 runtime state 并发更新的可靠性，而不是 scope 判定本身。 citeturn28view0turn17view6turn17view6turn17view7turn27view5turn23view3

**PR4：部分满足。**  
Subagent request 的 lane contract 校验、SubagentStart context 注入、SubagentStop 结构化 evidence 检查、pretool 阶段的 self-review 阻断都已经有了；但 reviewer 的 `reviewed_head_sha` 约束并没有在所有 stop/close 路径上一致 enforced，而且 stop gate 更关注“字段存在”而不是“该 SHA 与 worker 被 review 的 head 一致”。因此 PR4 还不能算完全通过。 citeturn17view1turn34view0turn32view2turn32view3turn33view2turn38view2turn40view7

**PR5：不满足。**  
原因有三：其一，GitHub 证据不完整时 decision 不够保守；其二，independent review evidence 结构要求过于宽松；其三，`ready_but_not_authorized` 仍然返回 exit 0。虽然 merge-check 作为显式 CLI 命令、且没有被挂进普通 interactive hook，这一点是满足 sprint 边界的，但核心 acceptance 仍未达标。 citeturn20view0turn20view2turn19view7turn40view5

## 重点核查结论

**public route registry 是否被错误扩展：没有发现。**  
这次实现遵循了 sprint / research 的建议：不新增公共 route tuple，而是在现有链路上增加内部 CLI 分支与已有 hook 路径的能力。`hook-entry.ts` 的新增分支都在 route 解析之前，`route-registry` 本身未见相应改动。 citeturn11view0turn40view7turn41view4

**`.ai/hooks` 与 `assets/hooks` 是否语义一致：抽样结果一致。**  
我抽查了 `pre-edit-guard.sh` 的 high-context gate 段落，两份脚本的逻辑与文案一致；`session-start-context.sh` 两份文件的体量与结构也一致，没有看到“一边更新、一边漏同步”的迹象。 citeturn26view0turn26view1turn26view2turn26view3

**Subagent reviewer 是否能绕过 `reviewed_head_sha`：能部分绕过。**  
Pretool 与 SubagentStop 路径会要求 reviewer 提供该字段，但它们主要验证“存在”，而不是验证“确实对应 worker 被 review 的 head”；同时 merge-check 也没有把缺失 `reviewed_head_sha` 判为失败。所以“完全不填”在部分路径会被拦住，但“填了一个任意值”或在 merge-check 侧“直接省略”都还有漏洞。 citeturn17view1turn34view0turn20view2

**reviewer 是否可能 review 自己：显式同值时会拦，但缺字段时仍可绕过 merge-check 的独立性证明。**  
Subagent pretool 和 stop-quality 对 `reviewed_lane_id/reviewer_for/worker_lane_id === reviewer lane` 的情况会拒绝；但是 merge-check 只有在 reviewer/worker lane id 都存在时才比较两者是否相同。因此“明显 self-review”会被挡住，“省略 lane 身份字段”的 evidence 仍可能被 accept。 citeturn32view3turn20view2

**`review merge-check` 在缺少 `--repo` 时是否仍能拿到 GraphQL review thread 状态：只有在能从 origin 推断出 repo slug 时可以，否则不行。**  
代码会先尝试从 `remote.origin.url` 推断 repo；只有拿到 `owner/name` 后才发 GraphQL `reviewThreads` 查询。测试也只覆盖了“可从 origin 推断”的情况，没有覆盖“推断失败”场景。 citeturn20view0turn23view1

## 其余非阻塞风险

除了上面的 blocker / high findings 之外，还有两类剩余风险值得记录。

其一，虽然 lane scope enforcement 本身我没有读出直接逻辑绕过，但 reviewer/head-evidence 的要求目前分散在 pretool、subagent-stop、merge-check、lane-stop 四条链路上，规则并不完全单点收敛；这类“同一约束在多个入口上重复实现”的结构，后续很容易继续出现 acceptance 漏洞。 citeturn17view1turn34view0turn20view2turn38view2

其二，测试矩阵对并发与大规模边界覆盖仍然偏弱。sprint 建议新增 `tests/lane-stop-gate.test.ts`、扩展 `tests/hook-runtime.test.ts` 等，但当前我没有看到 reviewer stop-gate 专项测试、no-`--repo` conservative merge-check 测试、并行 dirty/lane-state 更新测试，或 review thread 分页边界测试。现有 911 通过更像是“单线程 happy path 已覆盖”，还不足以证明 hook-runtime 级别没有 flaky / state leakage。 citeturn40view9turn31view4turn31view5turn36view0turn22view3