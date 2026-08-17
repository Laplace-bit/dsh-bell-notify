import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))
const fixtures = resolve(root, 'tests/fixtures')

export default defineConfig({
  root,
  resolve: {
    alias: {
      // Published client packages are ModuleLoader bundles, so Vitest needs a
      // small local facade for the two runtime values exercised by this repo.
      '@deepseek-ai/dsh-client-runtime/client': resolve(fixtures, 'dsh-client-runtime.ts'),
      '@deepseek-ai/dsh-client-ui-primitives': resolve(fixtures, 'dsh-client-ui-primitives.tsx'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // 入口 wiring 与宿主接口声明依赖真实 DSH 运行时，由集成测试（F1-F8）覆盖
      exclude: ['src/index.ts', 'src/types.ts', 'src/plugin.ts', 'src/client/index.ts', 'src/platform/sound-store.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
})
