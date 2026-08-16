import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // 入口 wiring 与宿主接口声明依赖真实 DSH 运行时，由集成测试（F1-F8）覆盖
      exclude: ['src/index.ts', 'src/types.ts', 'src/plugin.ts', 'src/client/index.ts', 'src/platform/indicator.ts', 'src/platform/sound-store.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
})
