# repo-harness hook runtime 与两个 Skill 的集成评估方案

## 结论摘要

我的结论是：**应该吸收一部分 Skill 思路，但不应该把两个 Skill 的完整正文直接塞进 hook runtime**。`repo-harness` 现在的 hook 体系已经明确把 hook 定位为“加速器和护栏”，而不是新的主工作流引擎；真正的权威仍然是 repo 内的 `spec`、`plan`、`contract`、`review`、`checks` 和 `handoff` 等文件化工件。与此同时，官方运行时文档还明确要求 hook 走短路径、前台超时约 30 秒、长耗时工作应放到显式 CLI 命令里，而不是 hook 热路径里。基于这个边界，**`threads` Skill 适合抽取少量“委派最小契约”放进已有 delegation hooks；`repo-agent-context-audit` Skill 适合做成一个显式 CLI 审计器，再用 changed-only 的 `SessionStart` 哨兵做轻量提醒**，而不适合做成每次 prompt 都跑的重扫描。fileciteturn30file0L114-L122 fileciteturn42file0L16-L18 fileciteturn42file0L35-L36

更具体地说，我建议分成两条线推进。第一条线是**“threads 的轻量吸收”**：保留 `repo-harness` 已有的显式授权、角色边界、子代理启动上下文、子代理停机质量门和 stop fallback 机制，只额外补进 `threads` Skill 里最有价值但目前缺位的几个点，比如“先写 lane map 再 spawn”“禁止把 `AGENTS.md` / `CLAUDE.md` / hooks / settings 这类高上下文文件随手分配给 worker 改”“如果是 review-then-merge，最终 merge reviewer 必须独立于实现 worker”。第二条线是**“repo-agent-context-audit 的产品化落地”**：不要做成 prompt-time 注入，而是做成 `repo-harness context-audit --json` 这类显式命令，并在 `SessionStart.default` 路由上加一个 changed-only 的上下文哨兵，像现在的 `security-sentinel.sh` 一样按指纹缓存结果，只在高上下文文件变化后给出一条短 advisory。fileciteturn18file0L132-L151 fileciteturn19file0L102-L118 fileciteturn20file0L65-L80 fileciteturn21file0L245-L247 fileciteturn22file0L25-L28 fileciteturn34file0L6-L13

## 两个 Skill 的真正价值

### threads Skill 的价值边界

`threads` 这个 Skill 的定位非常清楚：它不是一般意义上的“多线程建议”，而是一套**面向 Codex 原生并行子线程/子代理工作流的操作规范**。它明确要求在进入实现类模式前先写一份 lane map，支持 `plan_only`、`execute_direct`、`review_only`、`research_spec` 和 `clarify_first` 等模式，并强调 planner / reviewer 只读、worker 可写但必须文件所有权互斥、不得把 `AGENTS.md` / `CLAUDE.md` / hooks / setup scripts 之类高上下文文件默认分给 worker、以及“实现 worker 不能单独充当最终 merge 判断者”等规则。它的本质价值，不是“会开几个 agent”，而是**把并行执行变成受控的 lane orchestration**。citeturn5view0

所以，`threads` Skill 解决的是 repo-harness 当前 delegation 能力中的“后半段精细化治理”问题。`repo-harness` 已经能在用户明确授权时触发 bounded delegation，并且要求最多 3 个 agent、最大深度 1、不能让两个 agent 有重叠写权限、要等待所有 agent 返回并在 parent 中做 reconciliation；但 `threads` 进一步提供了**lane 级别的目标、可写文件、禁止文件、验证责任人、merge gate 与最终状态表**。这部分对于“多个 issue 并行、PR review 与 merge 拆 lane、研究与实现分离”的复杂任务特别有价值。fileciteturn18file0L105-L116 fileciteturn18file0L137-L151 citeturn5view0

### repo-agent-context-audit Skill 的价值边界

`repo-agent-context-audit` 这个 Skill，我在这次运行里**没能直接通过工具抓到 upstream 当前版的 `SKILL.md` 原文**，所以这里我把它当作“你在消息中贴出的那份详细说明”来使用，结论会以你提供的描述为准。按你给出的说明，它不是代码审计器，而是**仓库 AI 上下文架构审计器**：重点看 `AGENTS.md`、`CLAUDE.md`、Copilot instructions、仓库本地 skills、`PRODUCT.md` / `TECH.md` 之类文档是否形成“顶层路由 + 渐进式上下文 + 最小可用文件架构”，并且默认只读，不擅自写入。它关注的问题不是业务逻辑错没错，而是“agent 是否会在这个 repo 里读错文档、走错入口、重复扫描、命令过期、作用域混乱”。这一点，和 `repo-harness` 的产品目标其实是非常一致的。  

这种 Skill 的价值在 `repo-harness` 里尤其明显，因为 `repo-harness` 本身就强调“file-backed sessions, not chat memory”，并且已经有一整套上下文与合约同步设施：比如 `context-contract-sync.sh` 会根据架构事件更新本地 capability `AGENTS.md` / `CLAUDE.md` 合同块，并同步 `.ai/context/context-map.json` 的 discoverable contexts；`SessionStart` 还会根据 pending capability context、architecture queue、pending plan capture、current status、active sprint、tooling update advisory 等信息注入轻量上下文。也就是说，`repo-harness` 已经非常重视“agent context 结构化”，只是**还缺一个专门面向顶层 AI 文档质量的审计器**。fileciteturn30file0L9-L20 fileciteturn32file0L248-L260 fileciteturn33file0L20-L35 fileciteturn33file0L61-L84 fileciteturn13file0L13-L41 fileciteturn14file0L6-L60

## repo-harness 当前 runtime 已经覆盖了什么

从实现上看，`repo-harness` 的 hook runtime 已经相当成熟。路由注册表把公开契约明确成 `(event, routeId, matcher)` 三元组，并注明这是 host adapter 的稳定公共契约；当前事件覆盖 `SessionStart`、`PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`SubagentStart`、`SubagentStop` 和 `Stop`，其中 `SessionStart.default` 已经串了 `session-start-context.sh` 与 `security-sentinel.sh`，`UserPromptSubmit` 同时有默认 prompt guard 和 Codex 专用 delegation 路由，`SubagentStart` 和 `SubagentStop` 也已经存在 Codex 专线路由。架构文档里还明确写了当前 managed hooks 为 Codex 11 条路由、Claude 8 条路由。fileciteturn38file0L4-L20 fileciteturn38file0L58-L120 fileciteturn41file0L8-L18

它的运行机制也已经很适合“加第三个 SessionStart 哨兵脚本”这种扩展方式。`runHook()` 会先检查 repo 是否 opt-in，再走 route registry，然后做 central-first 的 hook 脚本解析；对 `SessionStart`，runtime 会收集每个脚本 stdout 返回的上下文，最后聚合成一条 `hookSpecificOutput.additionalContext` JSON；对 Codex，则只对少数合法场景转发 `decision` 或 `additionalContext` JSON，以免屏幕噪声过大。换句话说，**如果要加一个上下文审计哨兵，最自然的落点就是继续挂在 `SessionStart.default` 这一条现有聚合链上**，而不是新增公开 route tuple。fileciteturn39file0L109-L127 fileciteturn39file0L181-L246 fileciteturn40file0L33-L47 fileciteturn40file0L78-L91

当前 delegation 这条线也已经覆盖了大量 `threads` Skill 的基本面。`codex-delegation-advisor.sh` 只在用户**明确授权** delegation 时触发，会把状态写进 `.ai/harness/delegation/`，并下发“spawn no more than 3 agents”“allow_parallel_writers=false”“use explorer/worker/reviewer”之类 bounded delegation 规则；`subagent-start-context.sh` 会给 subagent 注入返回契约，要求汇报 inspected files/symbols、evidence、risks、tests/commands、recommended parent action，且不得宣称 overall completion；`subagent-stop-quality.sh` 会拦明显过薄的子代理报告；`stop-orchestrator.sh` 还会在显式 delegation 请求后，如果没有观察到 `SubagentStart`，对 parent 做一次 fallback block，要求先把独立 workstreams 委派出去再结束。也就是说，**repo-harness 已经有 delegation skeleton，缺的是 threads 那一层更精细的 lane governance，而不是从零开始的并行能力**。fileciteturn18file0L88-L124 fileciteturn18file0L132-L151 fileciteturn19file0L102-L118 fileciteturn20file0L65-L80 fileciteturn22file0L25-L28

此外，`repo-harness` 现在已经有一条与 `repo-agent-context-audit` 思路相近但目标不同的能力链：`context-contract-sync.sh` 用架构事件去更新 capability 层的 `AGENTS.md` / `CLAUDE.md` 与 `.ai/context/context-map.json`，并把这些 discoverable contexts 标成 capability-contract；`SessionStart` 负责把 pending queue 和当前执行态投影成短上下文；`doctor` 会检查 CLI、adapter、CodeGraph readiness、安全配置和 repo hook scripts 是否齐全。也就是说，**repo-harness 已经会“生成/同步上下文”，但还不会系统性“审计顶层 AI 文档质量”**。这正是 `repo-agent-context-audit` 值得接入的空白区。fileciteturn33file0L61-L84 fileciteturn33file0L155-L173 fileciteturn13file0L13-L41 fileciteturn14file0L24-L60 fileciteturn37file0L138-L156

## 与两个 Skill 的重叠、缺口和取舍

### threads 与现有 delegation 的关系

把 `threads` 全量塞进 hook，会有两个明显问题。第一，`threads` Skill 是**任务塑形器**，不是纯粹的低延迟 hook 规则：它要求选择 mode、编写 lane map、定义 verification owner、组织 merge gate、最终输出 compact status table，这些都更像一个显式 orchestration workflow，而不是在 `UserPromptSubmit` 或 `SubagentStart` 里静默注入的大段 prompt。第二，Codex 当前社区 issue 里已经有人持续报告：hook `additionalContext` 在一些版本/界面里会以可见 developer message 形式渲染出来；同时还有 issue 指出 `PreToolUse` 场景对 `additionalContext` 的支持并不完整。换句话说，如果把 `threads` 的整套长文本塞进 hook，很容易把 CLI transcript 冲得很脏，而且在某些事件类型上根本不适合放长上下文。citeturn14search0 citeturn14search3

但也不能因此错过 `threads` 的精华。因为从 repo-harness 当前实现看，它确实还没有把“lane map”这个结构提到显性层面。现有 delegation advisor 规定了最大 agent 数、角色、写权限互斥和等待/汇总责任，但没有强制 parent 在 spawn 前给出一个短 lane plan，更没有强调“高上下文文件默认列入 forbidden_files”“review then merge 必须有独立 merge reviewer”“报告中区分 remote truth 和 local state”这些非常实用的多代理 discipline。我的判断是：**应该吸收 threads 的结构化委派规则，但只能吸收成简短 contract，不该复制成整篇 hook prompt**。fileciteturn18file0L137-L151 citeturn5view0

### repo-agent-context-audit 与现有 context 体系的关系

`repo-agent-context-audit` 和 `repo-harness` 的关系不是替代，而是互补。`repo-harness` 现有上下文系统更偏向**“生成与同步”**：根据架构事件更新 capability 合同块、在 SessionStart 提醒 pending queue、在 doctor 里检查 runtime 与安装状态。`repo-agent-context-audit` 更偏向**“结构质量诊断”**：顶层路由有没有、顶层说明是不是过载、命令是否过期、规范是不是分层正确、复杂仓库是否缺 `PRODUCT.md` / `TECH.md`。这两者不是一回事。前者保证 agent 有上下文，后者保证这些上下文本身“可读、可导航、没过期”。因此我认为，这个 Skill **适合被 repo-harness 吸收为诊断能力**，但应当避开 hook 热路径，走 “CLI 审计器 + changed-only SessionStart 哨兵 + doctor/status 暴露” 的路线。fileciteturn30file0L31-L44 fileciteturn42file0L35-L43 fileciteturn33file0L155-L173

这里还有一个现实原因：repo-harness 自己的 hook 参考文档明确说，长耗时工作应放显式 CLI 命令，`PostEdit` 也不应该在 hook 里启动 LLM agent 或长流程；而 `repo-agent-context-audit` 按你贴出的说明，天然是一种**带扫描、比对、打分和命令校验的 read-only 审计**。这类能力放在 hook 里做“每次都跑”，既不符合 repo-harness 现在的 runtime 哲学，也会在大仓库里造成明显的性能和噪声问题。fileciteturn42file0L16-L18 fileciteturn42file0L43-L57 fileciteturn42file0L86-L89

## 推荐的详细方案

### 先吸收 threads 的最小有用子集

对 `threads`，我建议**不新增 route，不新增 host adapter tuple，只增强现有三处**。

第一处是 `assets/hooks/codex-delegation-advisor.sh`。现在它已经能识别 `/delegate`、`/parallel`、`spawn/use/run subagents`、中文“并行”“子代理”等显式授权语句，并下发 bounded delegation 规则。这里建议只新增一小段**lane-map contract 提示**，文本控制在 8–12 行以内，内容包括：在 spawn 前先写“lane / role / target / writable_files / forbidden_files / expected_output / verification”；默认把 `AGENTS.md`、`CLAUDE.md`、settings、hooks、setup scripts 作为 `forbidden_files`；若两个 lane 没法做到写集互斥，则不要并行写。这一层本质上是把 `threads` 的 “Lane Map + high-context forbidden_files” 吸收进已有 delegation advisor，而不是复制整篇 Skill。fileciteturn18file0L132-L151 citeturn5view0

第二处是 `assets/hooks/subagent-start-context.sh`。它现在已经要求 subagent 汇报 files/symbols、evidence、risks、tests、recommended parent action。我建议在这之上再补两项非常轻的字段要求：**lane id** 与 **owned files actually touched/inspected**。这样 parent 在 reconcile 时更容易把子代理产物映射回 lane map，也更接近 `threads` Skill 里的 lane discipline；但仍然保持这个 hook 是短 contract，而不是长 prompt。fileciteturn19file0L102-L118 citeturn5view0

第三处是 `assets/hooks/stop-orchestrator.sh`。现在它已经会在显式 delegation 请求却未观察到 `SubagentStart` 时做一次 fallback block。这里可以再加一个**极窄的 merge-gate 提示分支**：只有当 prompt 文本里存在“review then merge / review and merge / 审完就合 / 合并前复核”一类明确表述时，Stop 提醒 parent：实现 worker 不能作为最终 merge reviewer，且 merge 前必须基于当前 head 做 fresh verification。注意，我只建议“提醒”，不建议变成硬 block；因为 merge gate 真正应该放在 review artifact / explicit merge command 上，而不是 Stop hook 上。fileciteturn22file0L25-L28 citeturn5view0

### 把 repo-agent-context-audit 做成 repo-harness 的显式审计能力

对 `repo-agent-context-audit`，我的建议是**做成一条新的显式 CLI 命令**，例如：

```bash
repo-harness context-audit --json
repo-harness context-audit --json --check-commands
repo-harness context-audit --format markdown
```

这个命令的职责，是读仓库顶层和高上下文文件，产出一份结构化报告，而不是直接改文件。扫描面建议至少包含：`AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`.github/copilot-instructions.md`、`.agents/skills/**/SKILL.md`、`specs/**/PRODUCT.md`、`specs/**/TECH.md`、`.ai/context/context-map.json`、局部 capability `AGENTS.md/CLAUDE.md`。输出 JSON 最好包括 `status`、`score`、`issues[]`、`evidence[]`、`smallest_useful_change[]`、`files_scanned[]`。这样它既能单独运行，也能被 doctor、SessionStart sentinel 和未来的 UI/status 命令复用。这个形状和 repo-harness 现有 `security scan --json`、`doctor` 的产品风格是一致的。fileciteturn42file0L37-L43 fileciteturn37file0L138-L156

然后，再在 `SessionStart.default` 里追加第三个脚本，例如 `agent-context-sentinel.sh`。实现方式应完全模仿 `security-sentinel.sh`：只对高上下文文件集做 fingerprint；只有 fingerprint 变化或 TTL 失效时，才运行一次 `repo-harness context-audit --json`；结果缓存到 `.ai/harness/context-audit/latest.json` 与 `state.sha256`；如果状态是 healthy，则静默；如果是 warn/fail，则只输出**一行或一个短块 summary**，例如“top-level router missing”“AGENTS.md overloaded”“2 stale commands detected”，并提示用户显式运行 `repo-harness context-audit --json` 查看详情。这样既能把 Skill 的价值嫁接进 runtime，又不会让每个 session 都被长文档污染。fileciteturn34file0L6-L13 fileciteturn34file0L17-L41 fileciteturn34file0L83-L117 fileciteturn40file0L84-L91

### 不要把 context audit 做成阻塞式 hook

我不建议把这类审计放进 `PreToolUse` 或 `UserPromptSubmit.default` 做硬拦截。一个原因是 repo-harness 自己已经明确：prompt-layer 的 plan/spec/contract gates 是 advisory routing，真正的硬约束在 edit boundary；而 `PostToolUse` 也被定义成 warning-only，长流程和 LLM agent 不能在 hook 里自动启动。另一个原因是，OpenAI Codex 社区 issue 已经反复暴露出 hook `additionalContext` 的 UI 可见性问题，以及 `PreToolUse` 对 `additionalContext` 的支持差异。如果把 context audit 大块注入 prompt，不仅用户体验会变差，跨 host 行为也更不稳定。**最合适的模式就是：审计本身显式运行；hook 只做 changed-only 提醒。**fileciteturn42file0L21-L27 fileciteturn42file0L43-L57 citeturn14search0 citeturn14search3

## 具体落地步骤

### 代码与文件层面的改动建议

第一阶段，只改现有 runtime 的最小面。保持 `ROUTES` 不增不改，只在 `SessionStart.default` 的脚本列表里追加 `agent-context-sentinel.sh`，这样不会碰公开 route tuple，也不会改变 host adapter 的公共契约；这很重要，因为 route-registry 已经明确把 `(event, route-id, matcher)` 定义为公共契约，而且顺序变化会影响 Codex trust UX。fileciteturn38file0L4-L20 fileciteturn38file0L58-L63

第二阶段，新增 `src/cli/commands/context-audit.ts`。命令内部不要依赖模型调用，先做纯机械审计：文件发现、顶层路由存在性、文件负载阈值、重复命令块、显式命令是否在 repo 中可定位、`.ai/context/context-map.json` 与 capability 合同是否覆盖当前 discoverable contexts、是否存在 root-only 但没有 capability 分层的明显信号。对复杂仓库才打出需要 `PRODUCT.md` / `TECH.md` 的建议；对小仓库则允许健康状态是“无需新增文件”。这个“避免形式主义”非常关键，否则这个能力会和 repo-harness “最小 durable truth” 的哲学冲突。fileciteturn30file0L46-L54 fileciteturn33file0L61-L84

第三阶段，微调 delegation hooks。`codex-delegation-advisor.sh` 增加短 lane contract；`subagent-start-context.sh` 增加 `lane id` / `owned files` 返回要求；`stop-orchestrator.sh` 对显式 review-then-merge 任务增加 one-shot merge-review 提醒。整个改动要控制在**短、稳定、可缓存**的范围内，不要把数百行 Skill 正文塞进 hook。考虑到社区 issue 表明 Codex 可能把 hook context 可视化，越简短越稳。fileciteturn18file0L132-L151 fileciteturn19file0L102-L118 citeturn14search0

### 策略开关与缓存建议

这一套应该全部走策略开关。建议新增 `.ai/harness/policy.json` 字段，例如：

```json
{
  "context_audit": {
    "enabled": true,
    "ttl_seconds": 604800,
    "emit_on_status": ["warn", "fail"],
    "max_summary_findings": 3
  },
  "delegation": {
    "require_lane_map_hint": true,
    "merge_gate_hint": true,
    "high_context_forbidden_default": true
  }
}
```

这样可以让小仓库或高性能敏感仓库关闭 `context_audit`，也可以让纯 Claude-only 团队只启用 context audit，不启用 Codex delegation 增强。repo-harness 现有 hook 体系已经大量使用 policy/environment gate，这种设计与当前产品习惯完全一致。fileciteturn39file0L113-L127 fileciteturn42file0L13-L18

缓存上，建议复用 `security-sentinel.sh` 的模式：一个 `state.sha256` 记录指纹，一个 `latest.json` 记录最近审计结果，再额外加一个 `rendered` marker，避免同一份结果在连续 SessionStart 里重复刷屏。`session-start-context.sh` 的 tooling advisory 其实已经实现过“结果落盘 + TTL + rendered marker”的完整范式，可以直接照抄那一套状态机。fileciteturn12file0L130-L146 fileciteturn12file0L181-L208

### 测试与验收标准

测试上，至少要补四类。第一类是 `hook-contracts.test.ts`：确认 `SessionStart.default` 新脚本存在、提示词包含 `context-audit --json`，并且 delegation 增强提示出现在正确脚本里；第二类是 runtime 测试：确认 SessionStart 能把 `session-start-context.sh`、`security-sentinel.sh`、`agent-context-sentinel.sh` 三者上下文聚合输出；第三类是 `doctor` 测试：如果将来把 audit 暴露为 doctor check，检查 healthy/warn/fail 三态；第四类是 golden tests：对一个“缺 top-level router”“AGENTS.md 过载”“命令漂移”的假仓库，`repo-harness context-audit --json` 的输出字段必须稳定且可机器消费。repo-harness 现有测试风格已经覆盖 hook contracts 与 doctor checks，这种扩展是顺着现有测试基建走的。fileciteturn23file0L22-L31 fileciteturn23file0L97-L115 fileciteturn23file0L170-L189 fileciteturn37file0L179-L218

## 最终建议

如果目标是**让 repo-harness 的 hook runtime 更聪明**，那最值得接入的是 `repo-agent-context-audit` 的“只读诊断”思想，但必须以 **CLI 审计器 + changed-only SessionStart 哨兵 + doctor 可视化** 的方式进入产品；它不应该成为重扫描、重写文件、每回合注入大段 prompt 的 hook。相反，`threads` Skill 不适合整块接入 hook runtime，因为它本质是一个任务 orchestration playbook；但它里面关于 lane map、禁止高上下文文件默认下发给 worker、独立 merge reviewer、子代理结果契约的若干规则，非常适合被吸收到现有 delegation hooks 里，形成更强的 bounded delegation contract。fileciteturn42file0L21-L27 fileciteturn42file0L35-L36 fileciteturn18file0L132-L151 citeturn5view0

所以，最简明的产品判断可以写成一句话：**threads 要“抽规则，不搬全文”；repo-agent-context-audit 要“进产品，但进成显式审计器和 SessionStart 哨兵，而不是 prompt hook 大注入”**。这条路线最符合 repo-harness 当前的公共契约、central-first hook 架构、30 秒 hook 热路径约束，以及它已经形成的 file-backed authority 模型。fileciteturn38file0L4-L20 fileciteturn39file0L113-L127 fileciteturn42file0L16-L18 fileciteturn30file0L114-L122