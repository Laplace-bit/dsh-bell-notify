export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'success' | 'error'

export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth'

/** 配置层规则输入；`null` 表示显式关闭该字段（如禁用某个声音）。 */
export interface EventRuleInput {
  event: string
  soundId?: string | null
  uiStatus?: AgentStatus | null
  priority?: number
  cooldown?: number
}

/** 规则解析产物（冻结），字段语义已定，无缺省值残留。 */
export interface ResolvedRule {
  readonly event: string
  readonly soundId?: string
  readonly uiStatus?: AgentStatus
  readonly priority: number
  readonly cooldown: number
}

/** 单个音符的纯数据描述，由 platform 层渲染为 WebAudio 节点。 */
export interface Note {
  readonly wave: Wave
  /** 起始频率 Hz */
  readonly from: number
  /** 终止频率 Hz（扫频），缺省恒定 */
  readonly to?: number
  /** 相对声音起点的偏移秒 */
  readonly start: number
  readonly duration: number
  /** 峰值增益 0–1（最终乘 masterVolume） */
  readonly gain: number
}

export interface SoundRecipe {
  readonly id: string
  readonly notes: readonly Note[]
}
