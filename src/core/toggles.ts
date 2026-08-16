import { EVENTS } from '../events'

/**
 * 按事件维度的声音开关：弹窗渲染目录 + 默认种子。core 层零依赖，
 * 持久化通过注入的 storage 完成（客户端默认 window.localStorage，测试注入 fake）。
 */

export interface ToggleEntry {
  event: string
  label: string
  /** 首次（无持久化记录时）是否默认开启声音。 */
  defaultOn: boolean
}

/** 弹窗展示顺序即此数组顺序。默认只开「需要你行动 + 里程碑」三声，过程细节默认静默。 */
export const TOGGLEABLE_EVENTS: readonly ToggleEntry[] = [
  { event: EVENTS.sessionStart, label: '会话启动', defaultOn: false },
  { event: EVENTS.agentStart, label: '开始执行', defaultOn: true },
  { event: EVENTS.agentThinking, label: '开始思考', defaultOn: false },
  { event: EVENTS.toolStart, label: '工具调用', defaultOn: false },
  { event: EVENTS.toolDone, label: '工具完成', defaultOn: false },
  { event: EVENTS.commandStart, label: '命令执行', defaultOn: false },
  { event: EVENTS.commandDone, label: '命令完成', defaultOn: false },
  { event: EVENTS.agentWaiting, label: '等待确认', defaultOn: true },
  { event: EVENTS.agentDone, label: '本轮完成', defaultOn: true },
  { event: EVENTS.agentIdle, label: '回到空闲', defaultOn: false },
]

/** 最小存储接口（window.localStorage 与测试 fake 都满足）。 */
export interface ToggleStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'dsh.bell-notify.sound-toggles'

function defaultStorage(): ToggleStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null // 隐私模式等场景下访问 localStorage 会抛错
  }
}

/**
 * 按事件的声音开关表。持久化为 localStorage 下的单个 JSON 对象；
 * 读失败 / 数据损坏静默回退默认种子（fail-open，不影响宿主）。
 */
export class SoundToggles {
  private readonly state = new Map<string, boolean>()
  private readonly subscribers = new Set<() => void>()
  private readonly storage: ToggleStorage | null

  constructor(storage?: ToggleStorage | null) {
    this.storage = storage === undefined ? defaultStorage() : storage
    for (const entry of TOGGLEABLE_EVENTS) this.state.set(entry.event, entry.defaultOn)
    this.load()
  }

  isEnabled(event: string): boolean {
    return this.state.get(event) ?? true
  }

  set(event: string, on: boolean): void {
    if (this.state.get(event) === on) return
    this.state.set(event, on)
    this.persist()
    for (const fn of [...this.subscribers]) {
      try {
        fn()
      } catch {
        /* 单个订阅者异常静默降级 */
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn)
    return () => {
      this.subscribers.delete(fn)
    }
  }

  dispose(): void {
    this.subscribers.clear()
  }

  private load(): void {
    if (this.storage === null) return
    let raw: string | null
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch {
      return
    }
    if (raw === null) return
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (typeof parsed !== 'object' || parsed === null) return
      for (const entry of TOGGLEABLE_EVENTS) {
        const value = parsed[entry.event]
        if (typeof value === 'boolean') this.state.set(entry.event, value)
      }
    } catch {
      /* 损坏数据回退默认种子 */
    }
  }

  private persist(): void {
    if (this.storage === null) return
    const record: Record<string, boolean> = {}
    for (const entry of TOGGLEABLE_EVENTS) {
      const value = this.state.get(entry.event)
      if (value !== undefined) record[entry.event] = value
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      /* 存储失败静默：开关仍在本会话内生效 */
    }
  }
}
