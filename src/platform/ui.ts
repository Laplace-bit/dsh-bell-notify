import type { StatusMachine } from '../core/state'
import type { Timeline, TimelineEntry } from '../core/timeline'
import type { AgentStatus } from '../core/types'

export interface BellSnapshot {
  status: AgentStatus
  timeline: TimelineEntry[]
}

/** DSH UI 扩展点（组件宿主）的最小结构。 */
export interface UiComponentHost {
  registerComponent(name: string, component: unknown): void
}

/**
 * UI 状态管理器（platform 层）：
 * 桥接 core 状态机/时间线到 DSH Web UI 组件；
 * subscribe 返回退订函数，dispose 清理全部订阅（R4）。
 */
export class UIManager {
  private readonly listeners = new Set<(snapshot: BellSnapshot) => void>()
  private unsubscribeStatus: (() => void) | null = null

  constructor(
    private readonly machine: StatusMachine,
    private readonly timeline: Timeline,
  ) {
    this.unsubscribeStatus = machine.subscribe(() => this.notify())
  }

  get status(): AgentStatus {
    return this.machine.status
  }

  getSnapshot(): BellSnapshot {
    return { status: this.machine.status, timeline: this.timeline.toArray() }
  }

  /** UI 侧轮询/订阅入口；返回退订函数。 */
  subscribe(listener: (snapshot: BellSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 向 DSH UI 注册状态指示器与事件时间线两个组件的数据源。 */
  registerComponents(host: UiComponentHost): void {
    host.registerComponent('bell-status', {
      kind: 'status' as const,
      getStatus: () => this.machine.status,
    })
    host.registerComponent('bell-timeline', {
      kind: 'timeline' as const,
      getEntries: () => this.timeline.toArray(),
    })
  }

  dispose(): void {
    this.unsubscribeStatus?.()
    this.unsubscribeStatus = null
    this.listeners.clear()
  }

  private notify(): void {
    const snapshot = this.getSnapshot()
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot)
      } catch {
        /* 单个 UI 订阅者异常静默降级 */
      }
    }
  }
}
