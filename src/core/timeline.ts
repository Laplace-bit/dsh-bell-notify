import type { AgentStatus } from './types'

export interface TimelineEntry {
  readonly seq: number
  readonly event: string
  readonly at: number
  readonly status?: AgentStatus
  readonly soundId?: string
}

export const DEFAULT_TIMELINE_CAPACITY = 50

/** 固定容量环形缓冲：O(1) 追加、内存恒定，满足 F6 与 R3。 */
export class Timeline {
  private readonly buffer: (TimelineEntry | undefined)[]
  private head = 0
  private count = 0
  private nextSeq = 0

  constructor(capacity: number = DEFAULT_TIMELINE_CAPACITY) {
    this.buffer = new Array<TimelineEntry | undefined>(Math.max(1, Math.floor(capacity))).fill(undefined)
  }

  push(event: string, at: number, meta: { status?: AgentStatus; soundId?: string } = {}): TimelineEntry {
    const entry: TimelineEntry = Object.freeze({ seq: ++this.nextSeq, event, at, ...meta })
    this.buffer[this.head] = entry
    this.head = (this.head + 1) % this.buffer.length
    if (this.count < this.buffer.length) this.count++
    return entry
  }

  /** 按时间正序（旧 -> 新）返回全部条目。 */
  toArray(): TimelineEntry[] {
    const out: TimelineEntry[] = []
    const start = this.count < this.buffer.length ? 0 : this.head
    for (let i = 0; i < this.count; i++) {
      out.push(this.buffer[(start + i) % this.buffer.length]!)
    }
    return out
  }

  get length(): number {
    return this.count
  }

  clear(): void {
    this.buffer.fill(undefined)
    this.head = 0
    this.count = 0
  }
}
