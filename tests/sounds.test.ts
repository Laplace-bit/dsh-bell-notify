import { describe, expect, it } from 'vitest'
import { getRecipe, recipeDuration, SOUND_RECIPES } from '../src/core/sounds'

const EXPECTED_IDS = ['startup', 'click', 'notify', 'tick', 'drop', 'beep', 'rise', 'alert', 'success', 'confirm', 'error', 'failure']

describe('预置音效 Recipe', () => {
  it('包含全部 12 种预置声音', () => {
    expect(Object.keys(SOUND_RECIPES).sort()).toEqual([...EXPECTED_IDS].sort())
    for (const id of EXPECTED_IDS) {
      expect(getRecipe(id)).toBeDefined()
    }
  })

  it('未知 id 返回 undefined', () => {
    expect(getRecipe('nope')).toBeUndefined()
  })

  it('总时长与配方定义一致', () => {
    expect(recipeDuration(getRecipe('startup')!)).toBeCloseTo(0.35, 5)
    expect(recipeDuration(getRecipe('click')!)).toBeCloseTo(0.045, 5)
    expect(recipeDuration(getRecipe('notify')!)).toBeCloseTo(0.28, 5)
    expect(recipeDuration(getRecipe('tick')!)).toBeCloseTo(0.075, 5)
    expect(recipeDuration(getRecipe('drop')!)).toBeCloseTo(0.18, 5)
    expect(recipeDuration(getRecipe('beep')!)).toBeCloseTo(0.07, 5)
    expect(recipeDuration(getRecipe('rise')!)).toBeCloseTo(0.21, 5)
    expect(recipeDuration(getRecipe('alert')!)).toBeCloseTo(0.32, 5)
    expect(recipeDuration(getRecipe('success')!)).toBeCloseTo(0.33, 5)
    expect(recipeDuration(getRecipe('confirm')!)).toBeCloseTo(0.22, 5)
    expect(recipeDuration(getRecipe('error')!)).toBeCloseTo(0.4, 5)
    expect(recipeDuration(getRecipe('failure')!)).toBeCloseTo(0.35, 5)
  })

  it('所有音符参数合法', () => {
    for (const recipe of Object.values(SOUND_RECIPES)) {
      expect(recipe.notes.length).toBeGreaterThan(0)
      for (const note of recipe.notes) {
        expect(note.from).toBeGreaterThan(0)
        expect(note.duration).toBeGreaterThan(0)
        expect(note.start).toBeGreaterThanOrEqual(0)
        expect(note.gain).toBeGreaterThan(0)
        expect(note.gain).toBeLessThanOrEqual(1)
        if (note.to !== undefined) expect(note.to).toBeGreaterThan(0)
      }
    }
  })
})
