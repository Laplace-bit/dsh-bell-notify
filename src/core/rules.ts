import { EVENTS } from '../events'
import type { EventRuleInput, ResolvedRule } from './types'

const DEFAULT_PRIORITY = 5
const DEFAULT_COOLDOWN = 1000

/** 预置规则表：事件均为浏览器侧可从会话快照推导的生命周期信号。 */
export const DEFAULT_RULE_INPUTS: readonly EventRuleInput[] = [
  { event: EVENTS.sessionStart, soundId: 'startup', uiStatus: 'idle', priority: 6, cooldown: 3000 },
  { event: EVENTS.agentStart, soundId: 'click', uiStatus: 'working', priority: 3, cooldown: 500 },
  { event: EVENTS.agentThinking, soundId: 'notify', uiStatus: 'thinking', priority: 3, cooldown: 500 },
  { event: EVENTS.agentThinkingDone, priority: 3, cooldown: 0 },
  { event: EVENTS.toolStart, soundId: 'tick', uiStatus: 'working', priority: 3, cooldown: 300 },
  { event: EVENTS.toolDone, soundId: 'drop', priority: 4, cooldown: 0 },
  { event: EVENTS.commandStart, soundId: 'beep', uiStatus: 'working', priority: 3, cooldown: 500 },
  { event: EVENTS.commandDone, soundId: 'rise', priority: 4, cooldown: 0 },
  { event: EVENTS.agentWaiting, soundId: 'alert', uiStatus: 'waiting', priority: 8 },
  { event: EVENTS.agentDone, soundId: 'success', uiStatus: 'success', priority: 7, cooldown: 3000 },
  { event: EVENTS.agentIdle, soundId: 'confirm', uiStatus: 'idle', priority: 4 },
]

export interface RuleTableOptions {
  defaultPriority?: number
  defaultCooldown?: number
}

/**
 * 按事件名将用户规则逐字段覆盖合并到默认表（用户只需写要改的字段）。
 * `soundId: null` / `uiStatus: null` 用于显式关闭。
 */
export function mergeRuleInputs(
  user: readonly EventRuleInput[] = [],
  base: readonly EventRuleInput[] = DEFAULT_RULE_INPUTS,
): EventRuleInput[] {
  const merged = new Map<string, EventRuleInput>()
  for (const rule of base) merged.set(rule.event, rule)
  for (const rule of user) {
    const prev = merged.get(rule.event) ?? { event: rule.event }
    merged.set(rule.event, { ...prev, ...rule, event: rule.event })
  }
  return [...merged.values()]
}

/** O(1) 事件查表；构建产物冻结，热更新时整体重建即可，无中间态。 */
export class RuleTable {
  private readonly table = new Map<string, ResolvedRule>()

  constructor(
    inputs: readonly EventRuleInput[] = DEFAULT_RULE_INPUTS,
    options: RuleTableOptions = {},
  ) {
    const defaultPriority = options.defaultPriority ?? DEFAULT_PRIORITY
    const defaultCooldown = options.defaultCooldown ?? DEFAULT_COOLDOWN
    for (const input of inputs) {
      const resolved: ResolvedRule = {
        event: input.event,
        ...(input.soundId != null ? { soundId: input.soundId } : {}),
        ...(input.uiStatus != null ? { uiStatus: input.uiStatus } : {}),
        priority: input.priority ?? defaultPriority,
        cooldown: input.cooldown ?? defaultCooldown,
      }
      this.table.set(input.event, Object.freeze(resolved))
    }
  }

  get(event: string): ResolvedRule | undefined {
    return this.table.get(event)
  }

  get size(): number {
    return this.table.size
  }
}
