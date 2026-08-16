import { describe, expect, it, afterAll } from 'vitest'
import { injectBootConfig } from '../src/boot-config'
import { BELL_BOOT_GLOBAL, DEFAULT_CONFIG, readBootConfig } from '../src/config'

describe('injectBootConfig', () => {
  it('有 <body> 时把脚本插入到 body 开标签之后', () => {
    const html = '<html><head></head><body class="x"><div/></body></html>'
    const out = injectBootConfig(html, DEFAULT_CONFIG)
    const at = out.indexOf('<script>')
    expect(at).toBe(out.indexOf('<body class="x">') + '<body class="x">'.length)
    expect(out).toContain(`window[${JSON.stringify(BELL_BOOT_GLOBAL)}]`)
    expect(out).toContain('</script>')
  })

  it('无 <body> 时把脚本追加到末尾', () => {
    const html = '<html><head></head></html>'
    const out = injectBootConfig(html, DEFAULT_CONFIG)
    expect(out.endsWith('</script>')).toBe(true)
  })
})

describe('readBootConfig', () => {
  const g = globalThis as Record<string, unknown>
  const saved = g[BELL_BOOT_GLOBAL]

  it('无 host 桥接时返回默认配置', () => {
    delete g[BELL_BOOT_GLOBAL]
    expect(readBootConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('结构合法的桥接值原样返回', () => {
    const cfg = { ...DEFAULT_CONFIG, masterVolume: 0.5 }
    g[BELL_BOOT_GLOBAL] = cfg
    expect(readBootConfig()).toBe(cfg)
  })

  it('缺少 maxConcurrent 时抛错（fail loud）', () => {
    const cfg = { ...DEFAULT_CONFIG }
    delete (cfg as Record<string, unknown>).maxConcurrent
    g[BELL_BOOT_GLOBAL] = cfg
    expect(() => readBootConfig()).toThrow(/malformed/)
  })

  it('结构非法时抛错（fail loud）', () => {
    g[BELL_BOOT_GLOBAL] = { enabled: 'yes' }
    expect(() => readBootConfig()).toThrow(/malformed/)
  })

  afterAll(() => {
    if (saved === undefined) delete g[BELL_BOOT_GLOBAL]
    else g[BELL_BOOT_GLOBAL] = saved
  })
})
