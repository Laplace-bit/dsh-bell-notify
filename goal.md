# bell-notify 技术方案

## 一、项目定义

`bell-notify` 是 DeepSeek Harness (DSH) 的官方插件。它**不参与 Agent 推理**，通过监听 DSH 内置的 Cordis 事件总线，将 Agent 生命周期事件转化为：

- **视觉反馈**：DSH Web UI 中的动态状态图标与动画
- **听觉反馈**：通过 Web Audio API 播放预置固定铃声

**核心定位**：为 DSH Agent 提供轻量、零侵入、低延迟的“感官增强层”。

---

## 二、核心设计原则

1. **绝对旁路（Fail-Open）**：插件报错、音频加载失败或 UI 渲染卡顿，**绝不阻塞** DSH 主 Agent 循环。所有逻辑包裹在 `try-catch` 中，异常时静默降级。
2. **纯前端实现**：完全运行在 DSH Web 端（Browser/Electron），无需启动额外本地进程，无需 HTTP 通信。
3. **规则确定性**：V1 不引入大模型语义判断，采用**事件类型 → 动作**的确定性映射表。
4. **统一调度**：音频播放具备队列与优先级，杜绝多个声音同时爆音或覆盖。

---

## 三、技术选型

- **语言**：TypeScript
- **框架**：DSH 插件 SDK（基于 Cordis）
- **音频引擎**：Web Audio API（无需第三方库）
- **UI 框架**：DSH 内置 UI 扩展能力（组件注入）
- **配置格式**：`config.yml`（DSH 标准插件配置）

---

## 四、整体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                    DeepSeek Harness                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Cordis Event Bus                       │   │
│  │  (session:start, tool:exec, agent:thinking, ...)   │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │ 订阅 (ctx.on)                       │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               bell-notify 插件                       │   │
│  │                                                     │   │
│  │  ┌──────────────┐   ┌──────────────────────────┐  │   │
│  │  │ 事件监听模块  │──▶│      规则映射引擎         │  │   │
│  │  │ (Listener)   │   │ (Event → Action)         │  │   │
│  │  └──────────────┘   └───────────┬──────────────┘  │   │
│  │                                 │                   │   │
│  │                ┌────────────────┼───────────────┐  │   │
│  │                ▼                ▼               │  │   │
│  │       ┌──────────────┐  ┌──────────────┐       │  │   │
│  │       │ 音频调度器    │  │ UI 状态管理器 │       │  │   │
│  │       │ (Audio Sch)  │  │ (UI Manager) │       │  │   │
│  │       └──────┬───────┘  └──────┬───────┘       │  │   │
│  └──────────────┼──────────────────┼───────────────┘  │   │
│                 │                  │                   │   │
│                 ▼                  ▼                   │   │
│  ┌─────────────────────┐  ┌────────────────────────┐  │   │
│  │   Web Audio API     │  │   DSH Web UI 扩展       │  │   │
│  │   (振荡器合成)      │  │   • 动态状态指示器      │  │   │
│  └─────────────────────┘  │   • 事件时间线          │  │   │
│                            │   • 配置面板            │  │   │
│                            └────────────────────────┘  │   │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、核心模块设计

### 5.1 插件入口 (`index.ts`)

```typescript
import type { Context } from '@deepseek-ai/cordis'

export const name = 'bell-notify'
export const inject = ['ui']

export function apply(ctx: Context, config: BellConfig) {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    const soundEngine = new SoundEngine(audioCtx, config.audio)
    const uiManager = new UIManager(ctx, config.ui)
    const ruleEngine = new RuleEngine(config.rules)
    
    // 注册事件监听
    registerListeners(ctx, ruleEngine, soundEngine, uiManager)
    
    // 注册 UI 组件
    ctx.ui?.registerComponent('bell-status', StatusIndicator)
    ctx.ui?.registerComponent('bell-timeline', EventTimeline)
    
    ctx.effect(() => {
        return () => {
            soundEngine.dispose()
            uiManager.dispose()
            if (audioCtx.state !== 'closed') audioCtx.close()
        }
    })
}
```

### 5.2 事件监听与规则映射

采用**事件类型直连动作**的确定性映射：

```typescript
interface EventRule {
    event: string
    soundId?: string       // 空则不播放
    uiStatus: AgentStatus  // idle | thinking | working | waiting | success | error
    cooldown?: number
}

const DEFAULT_RULES: EventRule[] = [
    { event: 'session:start', soundId: 'startup', uiStatus: 'idle' },
    { event: 'agent:thinking', soundId: null, uiStatus: 'thinking' },
    { event: 'tool:execute', soundId: 'click', uiStatus: 'working' },
    { event: 'tool:complete', soundId: 'confirm', uiStatus: 'idle' },
    { event: 'tool:error', soundId: 'error', uiStatus: 'error' },
    { event: 'permission:required', soundId: 'alert', uiStatus: 'waiting' },
    { event: 'agent:done', soundId: 'success', uiStatus: 'success' },
    { event: 'error:occurred', soundId: 'failure', uiStatus: 'error' },
]
```

### 5.3 音频调度器（含防抖与优先级）

```typescript
class SoundEngine {
    private queue: { soundId: string, priority: number }[] = []
    private isPlaying = false
    private cooldownMap = new Map<string, number>()
    
    play(soundId: string, priority: number = 5) {
        const now = Date.now()
        if (this.cooldownMap.has(soundId) && now - this.cooldownMap.get(soundId)! < 2000) return
        
        this.queue.push({ soundId, priority })
        this.queue.sort((a, b) => b.priority - a.priority)
        this.cooldownMap.set(soundId, now)
        
        if (!this.isPlaying) this.processQueue()
    }
    
    private async processQueue() {
        if (this.queue.length === 0) { this.isPlaying = false; return }
        this.isPlaying = true
        const task = this.queue.shift()!
        
        try {
            await this.synthesizeAndPlay(task.soundId)
        } catch (e) { /* 静默降级 */ }
        
        await sleep(150)
        this.processQueue()
    }
}
```

### 5.4 声音合成策略（无需外部文件）

基于 Web Audio API 振荡器与增益包络合成：

| Sound ID | 合成方式 |
|----------|----------|
| `startup` | 200Hz → 800Hz 扫频，持续 0.3s |
| `click` | 800Hz 正弦波，0.05s |
| `confirm` | 600Hz + 900Hz 双音连奏 |
| `error` | 150Hz 方波，0.4s |
| `alert` | 500Hz 三次脉冲 |
| `success` | 523Hz, 659Hz, 784Hz 琶音上行 |
| `failure` | 400Hz → 200Hz 下滑音 |
| `notify` | 440Hz 单音，淡出 |

### 5.5 UI 状态管理器

```typescript
class UIManager {
    private status: AgentStatus = 'idle'
    private subscribers = new Set<(status: AgentStatus) => void>()
    
    update(status: AgentStatus) {
        this.status = status
        this.subscribers.forEach(fn => fn(status))
    }
}
```

**UI 动画定义**：

| 状态 | 视觉表现 |
|------|----------|
| `idle` | 静止灰色圆点 |
| `thinking` | 蓝色脉冲呼吸光晕（1.5s 周期） |
| `working` | 橙色旋转加载环 |
| `waiting` | 黄色闪烁（0.5s 间隔） |
| `success` | 绿色扩散波纹（持续 1s 后恢复 idle） |
| `error` | 红色抖动 + 感叹号 |

---

## 六、配置系统

`~/.dsh/plugins/bell-notify/config.yml`：

```yaml
enabled: true

audio:
  masterVolume: 0.7
  muteAll: false

rules:
  - event: "tool:execute"
    soundId: "click"
    uiStatus: "working"
    cooldown: 1000
  - event: "agent:done"
    soundId: "success"
    uiStatus: "success"
    cooldown: 3000

ui:
  showStatusIndicator: true
  showEventTimeline: true
  timelineMaxEntries: 50
```

---

## 七、数据流示例（工具执行）

```text
1. Agent 调用工具
   ↓
2. DSH 触发 Cordis 事件: "tool:execute"
   ↓
3. bell-notify 监听器捕获
   ↓
4. 规则引擎匹配: soundId="click", uiStatus="working"
   ↓
5. 音频调度器播放 "click"（若不在冷却）
   ↓
6. UI 管理器更新状态为 "working"（旋转动画）
   ↓
7. 用户听到短促点击，看到 Agent 正在工作
```

---

## 八、验收标准（V1 完成定义）

### 8.1 功能验收

| 编号 | 验收项 | 详细要求 |
|------|--------|----------|
| F1 | 插件安装 | 通过 `dsh plugin add bell-notify` 成功安装，重启 Web UI 后生效 |
| F2 | 基础事件反馈 | `session:start`、`tool:execute`、`tool:complete`、`agent:done`、`error:occurred` 均触发对应 UI 状态和声音 |
| F3 | 声音播放 | 预置 8 种声音均能正常播放，音量受 `masterVolume` 控制 |
| F4 | 静音开关 | `muteAll: true` 时静音，UI 动画正常 |
| F5 | UI 状态动画 | 6 种状态均有对应视觉动画，切换流畅 |
| F6 | 事件时间线 | UI 中实时滚动显示最近 50 条事件日志 |
| F7 | 配置热更新 | 修改 `config.yml` 后无需重启，插件自动重载 |
| F8 | 防抖机制 | 同一声音 2 秒内重复触发只播放第一次 |

### 8.2 性能验收

| 编号 | 验收项 | 指标 |
|------|--------|------|
| P1 | 事件处理延迟 | 事件触发到 UI 更新/声音播放 **≤ 50ms**（P95） |
| P2 | 内存占用 | 额外内存增量 **< 5MB** |
| P3 | CPU 占用 | 空闲时 **≈ 0%**；高频事件（100次/秒）时 **< 5%** |

### 8.3 可靠性验收

| 编号 | 验收项 | 详细要求 |
|------|--------|----------|
| R1 | 插件崩溃隔离 | 模拟未捕获异常，DSH Agent 主流程不中断 |
| R2 | 音频上下文失效 | Web Audio 不可用时静默降级，UI 动画依然工作 |
| R3 | 高频事件压力 | 连续触发 1000 次事件，队列不溢出，内存不增长 |
| R4 | 卸载干净 | 卸载后 UI 注入组件消失，事件监听全部移除，无内存泄漏 |

### 8.4 兼容性验收

| 编号 | 验收项 | 要求 |
|------|--------|------|
| C1 | 浏览器兼容 | Chrome 120+、Firefox 120+、Edge 120+ 全功能通过 |
| C2 | DSH 版本 | 兼容 DSH v1.x 及以上版本 |

---

## 九、交付清单

1. 插件源码（TypeScript）
2. 默认配置文件（`config.yml`）
3. 用户使用文档（安装、配置、自定义映射）
4. 单元测试覆盖率 > 80%
5. 集成测试（在真实 DSH 环境中验证 F1-F8）