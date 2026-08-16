# bell-notify 技术方案 V2（架构优化版）

> 本文档基于 `goal.md`（V1）的意图与验收标准不变的前提下，修正 V1 设计中的缺陷，并给出优化后的架构与实现方案。V1 的四条核心原则（绝对旁路 fail-open、纯前端、规则确定性、统一调度）全部保留并被**真正落实到实现层**。

---

## 一、V1 设计缺陷分析（优化动机）

| # | V1 缺陷 | 后果 | V2 修正 |
|---|---------|------|---------|
| 1 | `apply()` 中同步 `new AudioContext()`，未包 try-catch | 违反自己的 fail-open 原则；且浏览器自动播放策略下 AudioContext 初始为 `suspended`，声音根本播不出 | **惰性创建** + 播放前 `resume()`；构造与播放全程异常静默降级 |
| 2 | 配置中规则有 `cooldown` 字段，但 `SoundEngine` 硬编码 2000ms | 规则级冷却被忽略，F8 验收与配置语义脱节 | 冷却值由**规则解析结果**传入调度器，per-event 生效 |
| 3 | 队列无容量上限、无去重；`play()` 每次 `sort` | R3（1000 次事件）下队列无界增长、内存上涨；高频时 O(n log n) 排序浪费 CPU | 容量上限 + **同 soundId 合并（coalesce）** + 满队丢低优先级；小顶堆替代反复排序 |
| 4 | `processQueue` 固定 `sleep(150)` 判定播放结束 | 短音多等 150ms（P1 延迟超标风险）、长音未播完即重叠 | 以声音 Recipe 的**实际总时长**驱动出队节奏 |
| 5 | `EventRule` 无 `priority`，调度器签名里的 priority 无人传入 | 优先级机制形同虚设 | 规则增加 `priority`（默认 5），事件驱动传入 |
| 6 | 声音合成以硬编码函数体描述 | 不可单测、不可配置扩展 | 声音定义为**纯数据 Recipe**（音符序列），渲染器独立 |
| 7 | `UIManager.subscribers` 只增不减 | 泄漏，R4 无法通过 | `subscribe()` 返回退订函数，dispose 时清空 |
| 8 | 状态动画中"success 1s 后恢复 idle"无归属模块 | 瞬态状态回归逻辑缺失、定时器泄漏 | 引入**状态机**：瞬态状态自动回归 + 定时器统一清理 |
| 9 | `soundId?: string` 与 `soundId: null` 混用 | 类型不一致 | 统一为 `soundId?: string`（缺省即不播） |
| 10 | 未设计配置热更新机制（F7 无实现路径） | F7 无法验收 | 基于 Cordis config watch：配置变更 → 重建纯逻辑对象（零成本），音频上下文复用 |
| 11 | 无 `window` 存在性守卫 | SSR / Electron 主进程下崩溃 | 入口第一行守卫 `typeof window === 'undefined'` 则静默不启用 |
| 12 | 全部逻辑与 DOM/SDK 耦合 | 单测覆盖率 >80% 难以达成 | **分层**：core 纯逻辑（零依赖、时钟注入、同步可测）+ platform 薄适配层 |

## 二、优化后架构

核心思路：**把所有决策逻辑压进零依赖的 core 层**（规则、调度、状态机、时间线全是纯类/纯数据，时钟与播放器依赖注入），platform 层只做 WebAudio 渲染与 UI/Cordis 桥接。这样：

- 单测直接打 core 层，覆盖率 >80% 自然达成（交付项 4）；
- fail-open 边界清晰：platform 任何异常都终止于调度器/入口的 catch，core 层本身不可能抛 DOM 异常；
- P1（≤50ms）容易满足：事件 → core 决策全同步、O(1)~O(log n)，无 IO。

```text
┌────────────────────────────────────────────────────────────┐
│ Cordis 事件总线 (session:start, tool:execute, ...)         │
└───────────────┬────────────────────────────────────────────┘
                │ events.ts: 单一入口 onEvent(name)
                ▼
┌────────────────────────────────────────────────────────────┐
│ core/  —— 纯逻辑，零 DOM / 零 SDK 依赖，全部可单测         │
│                                                            │
│  RuleTable    Map<event, Rule>（O(1) 查表 + 配置深度合并） │
│  SoundScheduler  优先级小顶堆 + 冷却 + 合并 + 有界丢弃     │
│  StatusMachine    瞬态状态自动回归，定时器统一管理          │
│  Timeline         环形缓冲事件日志（默认 50 条）           │
│  SoundRecipes     纯数据音符表（8 种预置音效）             │
└───────┬──────────────────────────────┬─────────────────────┘
        │ 依赖注入                      │ 依赖注入
        ▼                              ▼
┌───────────────────────┐   ┌──────────────────────────────┐
│ platform/audio.ts     │   │ platform/ui.ts               │
│ WebAudioPlayer        │   │ UIManager（订阅退订、组件注册）│
│  • 惰性 AudioContext  │   │ StatusIndicator / Timeline   │
│  • master GainNode    │   └──────────────────────────────┘
│  • Recipe 渲染器      │
└───────────────────────┘
        ▲
┌───────┴────────────────────────────────────────────────────┐
│ index.ts  apply(ctx, config)：守卫 window、try-catch 全包、 │
│ wiring、config watch 热更新、dispose 清理                   │
└────────────────────────────────────────────────────────────┘
```

### 目录结构

```text
src/
  index.ts            # 插件入口：仅做 wiring 与生命周期
  types.ts            # Context 最小接口声明（不依赖真实 SDK 包也能编译）
  events.ts           # Cordis 事件名常量 + onEvent 单一分发口
  core/
    types.ts          # EventRule / AgentStatus / SoundRecipe 等纯类型
    rules.ts          # RuleTable：默认表 + 用户配置合并（per-event 覆盖）
    scheduler.ts      # SoundScheduler：有界优先队列 + 冷却 + 合并
    sounds.ts         # 8 种预置音效的纯数据 Recipe
    state.ts          # StatusMachine：瞬态回归
    timeline.ts       # Timeline 环形缓冲
  platform/
    audio.ts          # WebAudioPlayer（惰性 ctx、音量、Recipe 渲染）
    ui.ts             # UIManager + 组件注册桥
tests/
  rules.test.ts / scheduler.test.ts / state.test.ts
  timeline.test.ts / sounds.test.ts
```

## 三、关键机制设计

### 3.1 规则表（O(1) 查表 + 配置合并）

```ts
interface EventRule {
  event: string
  soundId?: string          // 缺省不发声
  uiStatus?: AgentStatus    // 缺省不改变状态
  priority?: number         // 1–9，默认 5；error/alert 类默认 8
  cooldown?: number         // ms，per-event；缺省用全局默认 1000
}
```

- 内部以 `Map<event, Rule>` 存储，事件分发 O(1)（V1 数组线性扫描）。
- 用户配置按 `event` 键**覆盖合并**到默认表（非整体替换），改一条规则无需抄全表。
- 解析产物是冻结对象（`readonly`），热更新时整体重建，无中间态。

### 3.2 声音调度器（有界、防抖、优先级、合并）

```text
submit(soundId, {priority, cooldown})
  ├─ 冷却期内? → 丢弃（F8）
  ├─ 已有同 soundId 在队列? → 丢弃（合并，R3 关键）
  ├─ 队列满(默认8)且新任务优先级 ≤ 队内最低? → 丢弃
  ├─ 队列满且新任务优先级更高? → 挤掉队内最低优先级
  └─ 入堆（小顶堆按优先级），空闲则立即播放
```

- 出队节奏由 Recipe 的**实际总时长**驱动（`player.play()` resolve 即声音自然结束），V1 的固定 `sleep(150)` 废除。
- 时钟注入（`now()`），单测可控时间。
- 冷却记录按 soundId 有界（≤ 预置音效数），不会随事件数增长（R3 内存不增长）。
- `player.play()` 抛错（WebAudio 不可用）→ 调度器 catch 后静默，UI 侧不受影响（R2）。

### 3.3 声音 Recipe（数据化）

```ts
interface Note {
  wave: OscillatorType      // sine | square | triangle | sawtooth
  from: number              // 起始频率 Hz
  to?: number               // 终止频率（扫频），缺省恒定
  start: number             // 相对声音起点偏移 s
  duration: number          // s
  gain: number              // 0–1，相对 masterVolume
}
interface SoundRecipe { id: string; notes: Note[] }
```

预置 8 种（与 V1 音色定义一一对应，仅数据化）：

| id | Recipe 概要 | 总时长 |
|----|------------|--------|
| startup | sine 200→800Hz 扫频 0.3s | 0.30s |
| click | sine 800Hz 0.05s | 0.05s |
| confirm | sine 600Hz 0.09s + 900Hz 0.12s 连奏 | 0.21s |
| error | square 150Hz 0.4s | 0.40s |
| alert | sine 500Hz ×3 脉冲各 0.09s 间隔 0.05s | 0.37s |
| success | sine 523/659/784Hz 琶音各 0.11s | 0.33s |
| failure | sine 400→200Hz 下滑 0.35s | 0.35s |
| notify | sine 440Hz 0.25s 淡出 | 0.25s |

### 3.4 WebAudio 播放器（platform 层）

- **惰性初始化**：首次 `play()` 才 `new AudioContext()`；创建/`resume()`/渲染任一步失败即抛出，由调度器吞掉（fail-open）。
- `masterGain` 节点统一 `masterVolume`（F3）；`muteAll` 时播放器直接短路（F4）。
- 渲染以 `audioCtx.currentTime` 为基准调度每个 Note（独立 oscillator + gain 包络：attack 5ms 防 click 爆音，linear decay），`Promise` 在总时长结束时 resolve。
- AudioContext 处于 `suspended`（浏览器自动播放策略）时先 `resume()` 再播；resume 失败静默丢弃本次。

### 3.5 状态机（瞬态回归）

- `idle/thinking/working/waiting` 为**稳态**；`success/error` 为**瞬态**（默认 1s 后自动回归进入前最后一个稳态）。
- 回归定时器由状态机持有并在新状态切换 / dispose 时统一 `clearTimeout`（修复 V1 泄漏风险）。
- `subscribe(fn)` 返回退订函数（修复 V1 泄漏，R4）。

### 3.6 时间线（环形缓冲）

固定容量（默认 50，可配）`Array` 环形写入，O(1) 追加、内存恒定（R3/F6）。

### 3.7 入口与生命周期

```ts
export function apply(ctx: Context, config: BellConfig) {
  if (typeof window === 'undefined') return          // SSR/Electron 主进程守卫
  try {
    // player / uiManager / core 对象 wiring
    // ctx.on(...) 事件监听（Cordis 卸载时自动移除）
    // config watch：重建 RuleTable / 调度参数 / 音量（F7）
    // ctx.on('dispose')：关 AudioContext、清订阅、清定时器（R4）
  } catch { /* fail-open：插件整体不可用也不影响宿主 */ }
}
```

- 每个事件回调内部再包一层 try-catch：**事件处理异常绝不上抛到事件总线**（R1）。
- 热更新策略：`RuleTable`、音量、timeline 容量等纯配置对象整体重建；`AudioContext` 与调度队列跨配置变更复用，避免重载时声音中断。

## 四、配置（兼容 V1 结构，语义修正）

```yaml
enabled: true

audio:
  masterVolume: 0.7        # 0–1
  muteAll: false
  maxQueue: 8              # 新增：调度队列容量（防溢出）
  defaultCooldown: 1000    # 新增：规则未指定冷却时的全局默认

rules:                     # 按 event 覆盖合并默认表，无需抄全表
  - event: "tool:execute"
    soundId: "click"
    uiStatus: "working"
    cooldown: 500          # V2 起真正生效（V1 被 2000ms 硬编码忽略）
    priority: 3
  - event: "error:occurred"
    soundId: "error"
    uiStatus: "error"
    priority: 8            # 高优先级可挤掉队列中的低优先级声音

ui:
  showStatusIndicator: true
  showEventTimeline: true
  timelineMaxEntries: 50
  statusRevertMs: 1000     # 新增：瞬态状态回归时长
```

## 五、验收标准映射

V1 验收表（F1–F8、P1–P3、R1–R4、C1–C2）全部保留，V2 落实情况：

| 项 | V2 保障机制 |
|----|------------|
| F3/F4 | masterGain + muteAll 短路 |
| F7 | config watch → 纯逻辑对象整体重建 |
| F8 | per-event 冷却真正生效（修复 V1 硬编码） |
| P1 | core 全同步 O(1)；惰性 AudioContext 首次播放后即驻留 |
| P2/P3/R3 | 有界队列 + 同音合并 + 冷却表有界 + 时间线环形缓冲 |
| R1 | 入口与每个事件回调双层 try-catch |
| R2 | player 抛错由调度器吞掉，UI 链路完全独立 |
| R4 | ctx.on 自动解绑 + subscribe 退订 + 定时器/audioCtx 统一清理 |
| 测试 | core 层零依赖 + 时钟/播放器注入，vitest 覆盖率 >80% |
