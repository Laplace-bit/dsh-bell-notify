export interface SoundPlayer {
  /**
   * 播放一个声音；在声音自然结束时 resolve。
   * WebAudio 不可用等情况应 reject，由调度器静默吞掉（fail-open）。
   */
  play(soundId: string): Promise<void>
}

export interface SubmitOptions {
  /** 1–9，越大越优先，默认 5 */
  priority?: number
  /** 冷却毫秒数（来自规则解析结果），默认 0 */
  cooldown?: number
}

export interface SchedulerOptions {
  player: SoundPlayer
  /** 时钟注入，测试可控；默认 Date.now */
  now?: () => number
  /** 等待队列容量上限，默认 8；满队时按优先级丢弃（R3） */
  maxQueue?: number
  /** 同时播放的声音数上限，默认 3；超出者进入等待队列 */
  maxConcurrent?: number
}

const DEFAULT_PRIORITY = 5
const DEFAULT_MAX_QUEUE = 8
const DEFAULT_MAX_CONCURRENT = 3

interface Task {
  soundId: string
  priority: number
}

/**
 * 统一音频调度器（并发模型）：
 * - 冷却期内丢弃（F8 防抖）；
 * - 同 soundId 去重（正在播放或等待队列中已存在则丢弃，高频事件只播一次，R3）；
 * - 最多 maxConcurrent 个声音并发播放——声音有自然时长，串行会让后续事件
 *   排队积压、听感滞后，并发保证新事件即时发声；
 * - 并发名额用尽时按优先级排队（有界，满队丢低优先级）；
 * - 出队节奏由 player.play() 的自然结束驱动（结束即补位），无固定 sleep；
 * - player 抛错静默吞掉，不影响后续任务与 UI 链路（R2）。
 */
export class SoundScheduler {
  private readonly player: SoundPlayer
  private readonly now: () => number
  private readonly maxQueue: number
  private readonly maxConcurrent: number
  /** 按优先级降序排列的等待队列（容量小，线性插入即可） */
  private queue: Task[] = []
  /** 当前正在播放的声音 id（去重用） */
  private readonly activeIds = new Set<string>()
  /** 当前正在播放的声音数 */
  private active = 0
  /** 冷却记录按 soundId 有界（≤ 音效种类数），不随事件数增长（R3） */
  private readonly lastAttemptAt = new Map<string, number>()

  constructor(options: SchedulerOptions) {
    this.player = options.player
    this.now = options.now ?? Date.now
    this.maxQueue = Math.max(1, options.maxQueue ?? DEFAULT_MAX_QUEUE)
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
  }

  /**
   * 提交一次发声请求。返回是否被接受（用于测试与遥测，调用方可忽略）。
   * 冷却为节流语义：距上次*被接受*的提交不足 cooldown 时丢弃（F8：
   * 持续触发下每个冷却窗口最多播一次，而非彻底静默）。
   */
  submit(soundId: string, options: SubmitOptions = {}): boolean {
    const priority = options.priority ?? DEFAULT_PRIORITY
    const cooldown = options.cooldown ?? 0
    const now = this.now()
    const last = this.lastAttemptAt.get(soundId)
    if (last !== undefined && now - last < cooldown) return false
    this.lastAttemptAt.set(soundId, now)

    if (this.activeIds.has(soundId) || this.queue.some((task) => task.soundId === soundId)) {
      return false
    }

    if (this.active < this.maxConcurrent) {
      this.start({ soundId, priority })
      return true
    }

    if (this.queue.length >= this.maxQueue) {
      const lowest = this.indexOfLowestPriority()
      if (priority <= this.queue[lowest]!.priority) return false
      this.queue.splice(lowest, 1)
    }
    let insertAt = this.queue.length
    while (insertAt > 0 && this.queue[insertAt - 1]!.priority < priority) insertAt--
    this.queue.splice(insertAt, 0, { soundId, priority })
    return true
  }

  get pendingCount(): number {
    return this.queue.length
  }

  get activeCount(): number {
    return this.active
  }

  get isPlaying(): boolean {
    return this.active > 0
  }

  dispose(): void {
    this.queue = []
    this.activeIds.clear()
    this.lastAttemptAt.clear()
  }

  private start(task: Task): void {
    this.active++
    this.activeIds.add(task.soundId)
    void this.run(task)
  }

  private indexOfLowestPriority(): number {
    let idx = 0
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i]!.priority < this.queue[idx]!.priority) idx = i
    }
    return idx
  }

  private async run(task: Task): Promise<void> {
    try {
      await this.player.play(task.soundId)
    } catch {
      /* fail-open：WebAudio 不可用等情况静默降级，不影响 UI 链路 */
    } finally {
      this.activeIds.delete(task.soundId)
      this.active--
      this.pump()
    }
  }

  /** 有并发名额空出且队列非空时，按优先级补位出队。 */
  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.start(task)
    }
  }
}
