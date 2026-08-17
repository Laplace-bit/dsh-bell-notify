/** Host half keeps notification preferences durable and exposes a loopback-only RPC. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, ConnectionRpcHandlerOptions } from '@deepseek-ai/dsh-client-connection'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Config, apply } from '../src/plugin.ts'
import { BELL_PACKAGE_NAME, BELL_PACKAGE_VERSION } from '../src/package-meta.ts'
import { updateNpmProfilePackage } from '../src/profile-installation.ts'
import { BELL_SETTINGS_RPC, BELL_SETTINGS_RPC_CHANNEL } from '../src/settings-api.ts'
import { BELL_SETTINGS_NS, DEFAULT_BELL_SETTINGS } from '../src/settings.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

interface RpcRegistration {
  channel: string
  handler: ConnectionRpcHandler
  options: ConnectionRpcHandlerOptions
}

const profiles = new Set<string>()

afterEach(() => {
  for (const profile of profiles) rmSync(profile, { recursive: true, force: true })
  profiles.clear()
})

function profileBaseUrl(specifier: string, bundled = true): string {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-bell-notify-profile-'))
  profiles.add(profile)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-test',
    private: true,
    dsh: { profile: { bundles: bundled ? [BELL_PACKAGE_NAME] : [] } },
    dependencies: { [BELL_PACKAGE_NAME]: specifier },
  }), 'utf8')
  return `${pathToFileURL(profile).href}/`
}

function profileDir(): string {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-bell-notify-profile-'))
  profiles.add(profile)
  return profile
}

function writeInstalledManifest(profile: string, manifest: object): void {
  const packageDir = join(profile, 'node_modules', BELL_PACKAGE_NAME)
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(manifest), 'utf8')
}

async function mountHost(baseUrl: string): Promise<{
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  registration: RpcRegistration
}> {
  const ctx = new Context()
  ctx.baseUrl = baseUrl
  let registration: RpcRegistration | undefined
  ctx.provide('connection', {
    rpc: {
      handle(channel: string, handler: ConnectionRpcHandler, options: ConnectionRpcHandlerOptions): () => Promise<void> {
        registration = { channel, handler, options }
        return async () => {}
      },
    },
  } as never)
  await ctx.plugin(MemorySettings).await()
  const fiber = ctx.plugin({ apply, Config })
  await fiber.await()
  if (registration === undefined) throw new Error('bell-notify RPC was not registered')
  return { ctx, fiber, registration }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

describe('bell-notify host settings', () => {
  it('reads the running package version from its manifest', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { name: string; version: string }
    expect(BELL_PACKAGE_NAME).toBe(manifest.name)
    expect(BELL_PACKAGE_VERSION).toBe(manifest.version)
  })

  it('serves durable notification preferences from a loopback-only plugin RPC', async () => {
    const { ctx, fiber, registration } = await mountHost(profileBaseUrl('^0.1.0'))

    expect(registration).toMatchObject({
      channel: BELL_SETTINGS_RPC_CHANNEL,
      options: { authority: 'loopback' },
    })
    const initial = await registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(initial).toMatchObject({
      ok: true,
      value: {
        enabled: true,
        muteAll: false,
        masterVolume: 0.7,
        installation: 'npm',
        canUpgrade: true,
      },
    })

    const updated = await registration.handler(BELL_SETTINGS_RPC.write, {
      enabled: false,
      muteAll: true,
      masterVolume: 0.35,
    }, signal())
    expect(updated).toMatchObject({
      ok: true,
      value: { enabled: false, muteAll: true, masterVolume: 0.35 },
    })
    expect(ctx.settings.get(settingsNamespace(BELL_SETTINGS_NS))).toEqual({
      enabled: false, muteAll: true, masterVolume: 0.35,
    })

    const malformed = await registration.handler(BELL_SETTINGS_RPC.write, {
      enabled: 'no', muteAll: false, masterVolume: 0.7,
    }, signal())
    expect(malformed).toMatchObject({ ok: false, error: { code: 'settings-rejected' } })
    await fiber.dispose()
  })

  it('enables package updates only for a confirmed npm profile dependency', async () => {
    const npm = await mountHost(profileBaseUrl('^0.1.0'))
    const npmRead = await npm.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(npmRead).toMatchObject({ ok: true, value: { installation: 'npm', canUpgrade: true } })
    await npm.fiber.dispose()

    const npmAlias = await mountHost(profileBaseUrl(`npm:${BELL_PACKAGE_NAME}@^0.1.0`))
    const npmAliasRead = await npmAlias.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(npmAliasRead).toMatchObject({ ok: true, value: { installation: 'npm', canUpgrade: true } })
    await npmAlias.fiber.dispose()

    const link = await mountHost(profileBaseUrl(`link:${process.cwd()}`))
    const linkRead = await link.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(linkRead).toMatchObject({ ok: true, value: { installation: 'development', canUpgrade: false } })
    const blocked = await link.registration.handler(BELL_SETTINGS_RPC.upgrade, {}, signal())
    expect(blocked).toMatchObject({ ok: false, error: { code: 'internal' } })
    await link.fiber.dispose()

    const localAlias = await mountHost(profileBaseUrl(`npm:${BELL_PACKAGE_NAME}@file:../dsh-bell-notify`))
    const localAliasRead = await localAlias.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(localAliasRead).toMatchObject({ ok: true, value: { installation: 'unmanaged', canUpgrade: false } })
    await localAlias.fiber.dispose()

    const workspace = await mountHost(profileBaseUrl('workspace:*'))
    const workspaceRead = await workspace.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(workspaceRead).toMatchObject({ ok: true, value: { installation: 'unmanaged', canUpgrade: false } })
    await workspace.fiber.dispose()

    const catalog = await mountHost(profileBaseUrl('catalog:bell-notify'))
    const catalogRead = await catalog.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(catalogRead).toMatchObject({ ok: true, value: { installation: 'unmanaged', canUpgrade: false } })
    await catalog.fiber.dispose()

    const unbundled = await mountHost(profileBaseUrl('^0.1.0', false))
    const unbundledRead = await unbundled.registration.handler(BELL_SETTINGS_RPC.read, {}, signal())
    expect(unbundledRead).toMatchObject({ ok: true, value: { installation: 'unmanaged', canUpgrade: false } })
    await unbundled.fiber.dispose()
  })

  it('reconciles a bundle that no longer declares dsh.bundle after an update', async () => {
    const profile = profileDir()
    const before = {
      name: 'dsh-profile-test',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', BELL_PACKAGE_NAME] } },
      dependencies: { [BELL_PACKAGE_NAME]: '^0.1.0' },
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify(before), 'utf8')
    writeInstalledManifest(profile, { name: BELL_PACKAGE_NAME })

    const update = vi.fn(async () => {})
    await updateNpmProfilePackage(profile, BELL_PACKAGE_NAME, update)

    expect(update).toHaveBeenCalledWith(profile, BELL_PACKAGE_NAME)

    const after = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }
    expect(after.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('adds a dependency that gained dsh.bundle after an update', async () => {
    const profile = profileDir()
    const before = {
      name: 'dsh-profile-test',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
      dependencies: { [BELL_PACKAGE_NAME]: '^0.1.0' },
    }
    writeFileSync(join(profile, 'package.json'), JSON.stringify(before), 'utf8')
    writeInstalledManifest(profile, { name: BELL_PACKAGE_NAME, dsh: { bundle: { patch: './cordis.patch.yml' } } })

    await updateNpmProfilePackage(profile, BELL_PACKAGE_NAME, async () => {})

    const after = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }
    expect(after.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', BELL_PACKAGE_NAME])
  })

  it('registers the durable namespace with defaults', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply, Config })
    await fiber.await()

    expect(ctx.settings.get(settingsNamespace(BELL_SETTINGS_NS))).toEqual(DEFAULT_BELL_SETTINGS)
    await fiber.dispose()
  })
})
