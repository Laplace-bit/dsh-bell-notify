/**
 * 按事件维度「自定义声音」分配表（core 层，零依赖）。
 *
 * 与 SoundToggles（开关）互补：本模块记录每个事件是否被用户指定了自定义
 * 声音文件，以及该文件在二进制存储里的键（`custom:<id>`）与原始文件名（用于
 * 设置界面展示）。持久化只存元数据（事件 → {key, name}），文件字节本身由
 * platform 层的 sound-store 存 IndexedDB。
 *
 * 自定义键 `custom:<id>` 直接充当播放器的 soundId：规则表里默认 `soundId`
 * （startup/click/...）只用于未指定自定义时回退。这样播放/试听/规则解析无需
 * 额外的重定向层。
 *
 * 旧版本持久化格式为 `{ [event]: "custom:..." }`（纯字符串），读取时兼容。
 */

export const CUSTOM_SOUND_PREFIX = 'custom:'

/** 最小存储接口（window.localStorage 与测试 fake 都满足）。 */
export interface AssignmentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * 自定义声音的二进制存储（平台层实现，如 IndexedDB）。core 层只依赖此接口，
 * 便于 node 环境用 fake 单测。
 */
export interface SoundFileStorage {
  put(key: string, blob: Blob): Promise<void>
  get(key: string): Promise<Blob | null>
  remove(key: string): Promise<void>
}

/** 单个事件的自定义声音元数据。 */
export interface SoundAssignment {
  /** 二进制存储键（`custom:<id>`），同时充当播放器 soundId。 */
  readonly key: string
  /** 原始文件名（仅展示用，可能为空）。 */
  readonly name?: string
}

export interface SoundAssignmentsOptions {
  /** 元数据存储；默认 window.localStorage（无 window 时为 null）。 */
  storage?: AssignmentStorage | null
}

const STORAGE_KEY = 'dsh.bell-notify.sound-assignments'

function defaultStorage(): AssignmentStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null // 隐私模式等场景下访问 localStorage 会抛错
  }
}

/**
 * 事件 → 自定义声音元数据 的分配表。持久化为 localStorage 下单个 JSON 对象；
 * 读失败 / 数据损坏静默回退「无自定义」（fail-open）。
 */
export class SoundAssignments {
  private readonly state = new Map<string, SoundAssignment>()
  private readonly subscribers = new Set<() => void>()
  private readonly storage: AssignmentStorage | null

  constructor(options: SoundAssignmentsOptions = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage
    this.load()
  }

  /** 某事件当前的分配元数据（含键与文件名），未指定返回 undefined。 */
  get(event: string): SoundAssignment | undefined {
    return this.state.get(event)
  }

  /** 某事件当前指定的自定义声音键（`custom:<id>`），未指定返回 undefined。 */
  getKey(event: string): string | undefined {
    return this.state.get(event)?.key
  }

  /** 某事件自定义声音的原始文件名，未指定返回 undefined。 */
  getName(event: string): string | undefined {
    return this.state.get(event)?.name
  }

  isCustom(event: string): boolean {
    return this.state.has(event)
  }

  /**
   * 指定（或清除）某事件的自定义声音。key 为 null/undefined 表示还原默认。
   * name 为展示用文件名，可省略。
   */
  set(event: string, key: string | null, name?: string): void {
    const prev = this.state.get(event)
    const next: SoundAssignment | undefined = key == null ? undefined : { key, name }
    if (prev?.key === next?.key && prev?.name === next?.name) return
    if (next === undefined) this.state.delete(event)
    else this.state.set(event, next)
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
      for (const [event, value] of Object.entries(parsed)) {
        const assignment = toAssignment(value)
        if (assignment) this.state.set(event, assignment)
      }
    } catch {
      /* 损坏数据回退「无自定义」 */
    }
  }

  private persist(): void {
    if (this.storage === null) return
    const record: Record<string, unknown> = {}
    for (const [event, assignment] of this.state) {
      record[event] = assignment.name !== undefined
        ? { key: assignment.key, name: assignment.name }
        : { key: assignment.key }
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      /* 存储失败静默：分配仍在本会话内生效 */
    }
  }
}

/** 归一化持久化值 → 分配元数据；非法值返回 undefined。兼容旧版纯字符串格式。 */
function toAssignment(value: unknown): SoundAssignment | undefined {
  if (typeof value === 'string' && value.startsWith(CUSTOM_SOUND_PREFIX)) {
    return { key: value }
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const key = record.key
    if (typeof key === 'string' && key.startsWith(CUSTOM_SOUND_PREFIX)) {
      const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : undefined
      return { key, name }
    }
  }
  return undefined
}
