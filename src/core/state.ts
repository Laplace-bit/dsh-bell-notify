import type { AgentStatus } from './types'

const STABLE_STATUSES: ReadonlySet<AgentStatus> = new Set(['idle', 'thinking', 'working', 'waiting'])

export const DEFAULT_REVERT_MS = 1000

export interface StatusMachineOptions {
  /** 瞬态状态（success/error）自动回归稳态的时长，默认 1000ms */
  revertMs?: number
}

/**
 * Agent 状态机：
 * - idle/thinking/working/waiting 为稳态，直接切换；
 * - success/error 为瞬态，revertMs 后自动回归进入前最后一个稳态；
 * - 回归定时器统一持有与清理，subscribe 返回退订函数，杜绝泄漏。
 */
export class StatusMachine {
  private currentStatus: AgentStatus = 'idle'
  private lastStable: AgentStatus = 'idle'
  private revertTimer: ReturnType<typeof setTimeout> | null = null
  private readonly subscribers = new Set<(status: AgentStatus) => void>()
  private revertMs: number

  constructor(options: StatusMachineOptions = {}) {
    this.revertMs = options.revertMs ?? DEFAULT_REVERT_MS
  }

  get status(): AgentStatus {
    return this.currentStatus
  }

  /** 热更新用：调整瞬态回归时长。 */
  configure(options: StatusMachineOptions): void {
    if (options.revertMs !== undefined) this.revertMs = options.revertMs
  }

  set(status: AgentStatus): void {
    if (STABLE_STATUSES.has(status)) {
      this.lastStable = status
      this.clearRevertTimer()
    } else {
      this.armRevertTimer()
    }
    if (this.currentStatus === status) return
    this.currentStatus = status
    this.emit(this.currentStatus)
  }

  subscribe(listener: (status: AgentStatus) => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  dispose(): void {
    this.clearRevertTimer()
    this.subscribers.clear()
  }

  private armRevertTimer(): void {
    this.clearRevertTimer()
    this.revertTimer = setTimeout(() => {
      this.revertTimer = null
      if (this.currentStatus === this.lastStable) return
      this.currentStatus = this.lastStable
      this.emit(this.currentStatus)
    }, this.revertMs)
  }

  private clearRevertTimer(): void {
    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer)
      this.revertTimer = null
    }
  }

  private emit(status: AgentStatus): void {
    // 单个订阅者异常不阻断其余订阅者与状态机本身（fail-open）
    for (const listener of [...this.subscribers]) {
      try {
        listener(status)
      } catch {
        /* 静默降级 */
      }
    }
  }
}
