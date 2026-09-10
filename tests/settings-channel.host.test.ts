/**
 * Host half mounts its settings channel even when the kernel's own
 * `connection.rpc.handle()` cannot resolve `webServer` from inside that
 * service. The browser then reaches the card instead of reporting the
 * connection as unable to read plugin settings.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, ConnectionRpcHandlerOptions } from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it } from 'vitest'
import { BELL_PACKAGE_VERSION } from '../src/package-meta.ts'
import { Config, apply } from '../src/plugin.ts'
import { BELL_SETTINGS_RPC, BELL_SETTINGS_RPC_CHANNEL } from '../src/settings-api.ts'
import { registerSettingsChannel } from '../src/settings-channel.ts'
import { BELL_SETTINGS_NS, DEFAULT_BELL_SETTINGS } from '../src/settings.ts'

/** In-memory settings provider -- same shape as the Harness's own specs. */
class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

/** One recorded reply, so a route can be driven without a real socket. */
interface Exchange {
  status: number
  body: string
}

/** Web server stand-in that records routes and drops them on disposal. */
function fakeWebServer(routes: WebRoute[]): {
  register(route: WebRoute): () => void
  tapIndex(): () => void
} {
  return {
    register(route: WebRoute): () => void {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
    tapIndex(): () => void { return () => {} },
  }
}

interface Mounted {
  ctx: Context
  routes: WebRoute[]
  dispose: () => Promise<void>
}

/**
 * Mount the Host half over a connection service whose `rpc.handle()` fails the
 * way the broken kernel generation does.
 * @param options - whether the fake connection exposes its request fence, and
 * an optional `rpc` override for the kernels that mount the channel themselves.
 */
async function mountHost(options: {
  fenced?: boolean
  rpc?: unknown
} = {}): Promise<Mounted> {
  const { fenced = true } = options
  const ctx = new Context()
  ctx.baseUrl = `${pathToFileURL(process.cwd()).href}/`
  const routes: WebRoute[] = []
  ctx.provide('webServer', fakeWebServer(routes) as never)
  ctx.provide('connection', {
    rpc: options.rpc ?? {
      handle(_channel: string, _handler: ConnectionRpcHandler, _options: ConnectionRpcHandlerOptions): () => Promise<void> {
        throw new Error('cannot get property "webServer" without inject')
      },
    },
    ...fenced
      ? {
        requestRejection(request: unknown): 401 | undefined {
          return (request as IncomingMessage).headers.cookie === undefined ? 401 : undefined
        },
      }
      : {},
  } as never)
  await ctx.plugin(MemorySettings).await()
  const fiber = ctx.plugin({ apply, Config })
  await fiber.await()
  return { ctx, routes, dispose: () => fiber.dispose() }
}

const mounted: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const dispose of mounted.splice(0)) await dispose()
})

/** Drive one route with a request envelope and capture the reply. */
async function call(
  route: WebRoute,
  endpoint: string,
  payload: unknown,
  options: { method?: string; headers?: Record<string, string>; body?: string; url?: string } = {},
): Promise<Exchange> {
  const method = options.method ?? 'POST'
  const headers = options.headers ?? { 'content-type': 'application/json', cookie: 'dsh=browser' }
  const body = options.body
    ?? JSON.stringify({ type: 'client-request', rpcId: 'probe-1', method: endpoint, payload })
  const req = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage
  req.method = method
  req.url = options.url ?? `${BELL_SETTINGS_RPC_CHANNEL}/${endpoint}`
  req.headers = headers
  const state: Exchange = { status: 0, body: '' }
  const res = {
    writeHead(status: number) { state.status = status; return res },
    end(value?: string) { state.body = value ?? '' },
    on() { return res },
  } as unknown as ServerResponse
  await route.handler(req, res)
  return state
}

/** The mounted channel route, asserted present. */
function channelRoute(routes: WebRoute[]): WebRoute {
  const route = routes.find(candidate => candidate.path === BELL_SETTINGS_RPC_CHANNEL)
  expect(route).toMatchObject({ kind: 'prefix', path: BELL_SETTINGS_RPC_CHANNEL })
  return route as WebRoute
}

describe('bell-notify settings channel fallback', () => {
  it('mounts the channel directly when the connection service cannot, and serves the settings', async () => {
    const host = await mountHost()
    mounted.push(host.dispose)

    const route = channelRoute(host.routes)
    const read = await call(route, BELL_SETTINGS_RPC.read, {})
    expect(read.status).toBe(200)
    expect(JSON.parse(read.body)).toMatchObject({
      type: 'server-response',
      rpcId: 'probe-1',
      result: {
        ok: true,
        value: {
          version: BELL_PACKAGE_VERSION,
          writable: true,
          enabled: DEFAULT_BELL_SETTINGS.enabled,
          masterVolume: DEFAULT_BELL_SETTINGS.masterVolume,
        },
      },
    })

    const write = await call(route, BELL_SETTINGS_RPC.write, { enabled: false, masterVolume: 0.25 })
    expect(JSON.parse(write.body)).toMatchObject({
      result: { ok: true, value: { enabled: false, masterVolume: 0.25 } },
    })
    expect(host.ctx.settings.get(BELL_SETTINGS_NS as SettingsNamespace))
      .toMatchObject({ enabled: false, masterVolume: 0.25 })

    await host.dispose()
    mounted.pop()
    expect(host.routes).toEqual([])
  })

  it('keeps the connection request fence and the router rules on the direct route', async () => {
    const host = await mountHost()
    mounted.push(host.dispose)
    const route = channelRoute(host.routes)

    expect(await call(route, BELL_SETTINGS_RPC.read, {}, { headers: { 'content-type': 'application/json' } }))
      .toEqual({ status: 401, body: 'unauthorized' })

    expect((await call(route, BELL_SETTINGS_RPC.read, {}, { method: 'GET' })).status).toBe(404)
    expect((await call(route, BELL_SETTINGS_RPC.read, {}, { url: '/elsewhere/settings.read' })).status).toBe(404)
    expect((await call(route, BELL_SETTINGS_RPC.read, {}, { url: `${BELL_SETTINGS_RPC_CHANNEL}/../escape` })).status).toBe(404)
    expect((await call(route, BELL_SETTINGS_RPC.read, {}, { headers: { 'content-type': 'text/plain', cookie: 'dsh=browser' } })).status).toBe(415)
    expect((await call(route, BELL_SETTINGS_RPC.read, {}, { body: 'not json' })).status).toBe(400)

    const tooLarge = await call(route, BELL_SETTINGS_RPC.read, {}, { body: `"${'x'.repeat(1 << 21)}"` })
    expect(tooLarge.status).toBe(413)

    const mismatched = await call(route, BELL_SETTINGS_RPC.read, {}, {
      body: JSON.stringify({ type: 'client-request', rpcId: 'probe-2', method: 'settings.write', payload: {} }),
    })
    expect(JSON.parse(mismatched.body)).toMatchObject({
      rpcId: 'probe-2',
      result: { ok: false, error: { code: 'gateway/bad-request' } },
    })

    const malformed = await call(route, BELL_SETTINGS_RPC.read, {}, { body: JSON.stringify({ rpcId: 7 }) })
    expect(JSON.parse(malformed.body)).toMatchObject({
      rpcId: 'invalid-request',
      result: { ok: false, error: { code: 'gateway/bad-request' } },
    })

    // Unknown endpoints are decoded failures, not transport failures.
    const unknown = await call(route, 'no.such.endpoint', {})
    expect(unknown.status).toBe(200)
    expect(JSON.parse(unknown.body)).toMatchObject({ result: { ok: false, error: { code: 'internal' } } })
  })

  it('reports a throwing endpoint handler as a transport failure', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    ctx.provide('webServer', fakeWebServer(routes) as never)
    ctx.provide('connection', {
      rpc: { handle() { throw new Error('cannot get property "webServer" without inject') } },
      requestRejection() { return undefined },
    } as never)

    registerSettingsChannel(ctx, '/probe-channel', async () => { throw new Error('boom') })
    const route = routes.find(candidate => candidate.path === '/probe-channel') as WebRoute
    const exchange = await call(route, 'probe.read', {}, { url: '/probe-channel/probe.read' })
    expect(exchange.status).toBe(500)
    expect(exchange.body).toContain('handler failure')
  })

  it('fails closed instead of exposing the channel without the connection fence', async () => {
    const host = await mountHost({ fenced: false })
    mounted.push(host.dispose)
    expect(host.routes).toEqual([])
    // The plugin still applies: only the card's read is unavailable.
    expect(host.ctx.settings.get(BELL_SETTINGS_NS as SettingsNamespace)).toEqual(DEFAULT_BELL_SETTINGS)
  })

  it('falls back when the service exposes no usable handler or release', async () => {
    const host = await mountHost({ rpc: {} })
    mounted.push(host.dispose)
    channelRoute(host.routes)

    const noRelease = await mountHost({ rpc: { handle: () => undefined } })
    mounted.push(noRelease.dispose)
    channelRoute(noRelease.routes)
  })

  it('stays on the service-owned channel when the kernel can mount it', async () => {
    let registered: { channel: string; handler: ConnectionRpcHandler } | undefined
    const host = await mountHost({
      rpc: {
        handle(channel: string, handler: ConnectionRpcHandler) {
          registered = { channel, handler }
          return async () => {}
        },
      },
    })
    mounted.push(host.dispose)
    expect(registered?.channel).toBe(BELL_SETTINGS_RPC_CHANNEL)
    expect(host.routes).toEqual([])
  })
})
