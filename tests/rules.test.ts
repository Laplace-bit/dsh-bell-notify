import { describe, expect, it } from 'vitest'
import { DEFAULT_RULE_INPUTS, mergeRuleInputs, RuleTable } from '../src/core/rules'

describe('RuleTable 默认表', () => {
  it('预置 10 类生命周期事件且解析出默认 priority/cooldown', () => {
    const table = new RuleTable()
    expect(table.size).toBe(10)

    const waiting = table.get('agent:waiting')!
    expect(waiting.soundId).toBe('alert')
    expect(waiting.uiStatus).toBe('waiting')
    expect(waiting.priority).toBe(8)
    expect(waiting.cooldown).toBe(1000)

    const idle = table.get('agent:idle')!
    expect(idle.soundId).toBe('confirm')
    expect(idle.priority).toBe(4)
    expect(idle.cooldown).toBe(1000)
  })

  it('新增细粒度事件（thinking/tool/command）都有默认规则', () => {
    const table = new RuleTable()

    const thinking = table.get('agent:thinking')!
    expect(thinking.soundId).toBe('notify')
    expect(thinking.uiStatus).toBe('thinking')
    expect(thinking.cooldown).toBe(500)

    const toolStart = table.get('tool:start')!
    expect(toolStart.soundId).toBe('tick')
    expect(toolStart.uiStatus).toBe('working')
    expect(toolStart.cooldown).toBe(300)

    const toolDone = table.get('tool:done')!
    expect(toolDone.soundId).toBe('drop')
    expect(toolDone.uiStatus).toBeUndefined()
    expect(toolDone.cooldown).toBe(0)

    const commandStart = table.get('command:start')!
    expect(commandStart.soundId).toBe('beep')
    expect(commandStart.uiStatus).toBe('working')

    const commandDone = table.get('command:done')!
    expect(commandDone.soundId).toBe('rise')
    expect(commandDone.uiStatus).toBeUndefined()
  })

  it('agent:start 使用规则级冷却与低优先级', () => {
    const rule = new RuleTable().get('agent:start')!
    expect(rule.soundId).toBe('click')
    expect(rule.uiStatus).toBe('working')
    expect(rule.cooldown).toBe(500)
    expect(rule.priority).toBe(3)
  })

  it('解析产物被冻结', () => {
    const rule = new RuleTable().get('agent:done')!
    expect(Object.isFrozen(rule)).toBe(true)
  })

  it('未知事件返回 undefined', () => {
    expect(new RuleTable().get('nope:event')).toBeUndefined()
  })

  it('defaultPriority / defaultCooldown 可全局覆盖', () => {
    const table = new RuleTable([{ event: 'custom:event' }], {
      defaultPriority: 2,
      defaultCooldown: 300,
    })
    const rule = table.get('custom:event')!
    expect(rule.priority).toBe(2)
    expect(rule.cooldown).toBe(300)
  })
})

describe('mergeRuleInputs 配置合并', () => {
  it('用户规则按 event 逐字段覆盖，未写字段保留默认值', () => {
    const merged = mergeRuleInputs([{ event: 'agent:start', cooldown: 200, priority: 1 }])
    const rule = new RuleTable(merged).get('agent:start')!
    expect(rule.soundId).toBe('click')
    expect(rule.uiStatus).toBe('working')
    expect(rule.cooldown).toBe(200)
    expect(rule.priority).toBe(1)
  })

  it('soundId: null 显式关闭声音', () => {
    const merged = mergeRuleInputs([{ event: 'agent:start', soundId: null }])
    const rule = new RuleTable(merged).get('agent:start')!
    expect(rule.soundId).toBeUndefined()
    expect(rule.uiStatus).toBe('working')
  })

  it('uiStatus: null 显式关闭状态切换', () => {
    const merged = mergeRuleInputs([{ event: 'agent:done', uiStatus: null }])
    const rule = new RuleTable(merged).get('agent:done')!
    expect(rule.uiStatus).toBeUndefined()
    expect(rule.soundId).toBe('success')
  })

  it('新增默认表中不存在的自定义事件', () => {
    const merged = mergeRuleInputs([{ event: 'custom:event', soundId: 'notify' }])
    const table = new RuleTable(merged)
    expect(table.size).toBe(11)
    expect(table.get('custom:event')!.soundId).toBe('notify')
  })

  it('默认表本身可直接作为输入', () => {
    const table = new RuleTable(DEFAULT_RULE_INPUTS)
    expect(table.get('session:start')!.soundId).toBe('startup')
  })
})
