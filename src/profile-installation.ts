/** Host-only profile-source inspection and fixed npm update runner. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface NpmProfileInstallation {
  kind: 'npm'
  profileDir: string
  profileName: string
}

export interface DevelopmentProfileInstallation {
  kind: 'development'
}

export interface UnmanagedProfileInstallation {
  kind: 'unmanaged'
}

/** Source classification used to decide whether a fixed update command is safe. */
export type ProfileInstallation = NpmProfileInstallation | DevelopmentProfileInstallation | UnmanagedProfileInstallation

interface ProfileManifest {
  dependencies?: unknown
  dsh?: unknown
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function profileDirectory(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined) return undefined
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'file:' ? fileURLToPath(url) : undefined
  } catch {
    return undefined
  }
}

function readProfileManifest(profileDir: string): ProfileManifest {
  const value = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as unknown
  if (record(value) === undefined) throw new Error(`dsh-bell-notify: profile manifest at ${profileDir} must be an object`)
  return value as ProfileManifest
}

function hasBundle(manifest: ProfileManifest, packageName: string): boolean {
  const dsh = record(manifest.dsh)
  const profile = record(dsh?.profile)
  return Array.isArray(profile?.bundles) && profile.bundles.includes(packageName)
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('link:')
    || specifier.startsWith('file:')
    || specifier.startsWith('.')
    || isAbsolute(specifier)
    || /^[A-Za-z]:[\\/]/.test(specifier)
}

function isRegistrySpecifier(specifier: string): boolean {
  return specifier.length > 0 && !specifier.includes(':') && !/[\\/]/.test(specifier)
}

function isNpmSpecifier(specifier: string, packageName: string): boolean {
  if (!specifier.startsWith('npm:')) return isRegistrySpecifier(specifier)
  const alias = specifier.slice('npm:'.length)
  if (alias === packageName) return true
  const prefix = `${packageName}@`
  return alias.startsWith(prefix) && isRegistrySpecifier(alias.slice(prefix.length))
}

/** Inspect the active profile without trusting arbitrary client input. */
export function inspectProfileInstallation(baseUrl: string | undefined, packageName: string): ProfileInstallation {
  const profileDir = profileDirectory(baseUrl)
  if (profileDir === undefined) return { kind: 'unmanaged' }
  let manifest: ProfileManifest
  try {
    manifest = readProfileManifest(profileDir)
  } catch {
    return { kind: 'unmanaged' }
  }
  const dependencies = record(manifest.dependencies)
  const specifier = dependencies?.[packageName]
  if (typeof specifier !== 'string' || !hasBundle(manifest, packageName)) return { kind: 'unmanaged' }
  if (isLocalSpecifier(specifier)) return { kind: 'development' }
  if (!isNpmSpecifier(specifier, packageName)) return { kind: 'unmanaged' }
  return { kind: 'npm', profileDir, profileName: basename(profileDir) }
}

function packageExportsBundle(profileDir: string, packageName: string): boolean {
  const anchor = join(profileDir, 'package.json')
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const packageDir = join(searchPath, packageName)
    const manifestPath = join(packageDir, 'package.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = record(JSON.parse(readFileSync(manifestPath, 'utf8')))
      const dsh = record(manifest?.dsh)
      return record(dsh?.bundle)?.patch !== undefined
    } catch {
      return false
    }
  }
  return false
}

/**
 * Mirror Harness' profile bundle reconciliation after pnpm changes installed
 * dependencies. In-box layers remain untouched; direct dependencies that no
 * longer export `dsh.bundle` are removed from the profile list.
 */
function reconcileProfileBundles(profileDir: string, before: ProfileManifest): void {
  const after = readProfileManifest(profileDir)
  const beforeDependencies = new Set(Object.keys(record(before.dependencies) ?? {}))
  const dependencies = Object.keys(record(after.dependencies) ?? {})
  const dependencySet = new Set(dependencies)
  const dsh = record(after.dsh)
  const profile = record(dsh?.profile)
  const bundles = Array.isArray(profile?.bundles)
    ? profile.bundles.filter((value): value is string => typeof value === 'string')
    : []
  let changed = false

  for (const packageName of dependencies) {
    if (packageExportsBundle(profileDir, packageName) && !bundles.includes(packageName)) {
      bundles.push(packageName)
      changed = true
    }
  }
  for (const packageName of [...bundles]) {
    const wasDependency = beforeDependencies.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && packageExportsBundle(profileDir, packageName)
    if (wasDependency && !stillBundle) {
      bundles.splice(bundles.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return
  after.dsh = { ...dsh, profile: { ...profile, bundles } }
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify(after, undefined, 2) + '\n')
}

/** The fixed command runner can be replaced by host tests without invoking pnpm. */
export type ProfilePackageUpdater = (profileDir: string, packageName: string) => Promise<void>

function runPnpmUpdate(profileDir: string, packageName: string): Promise<void> {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['update', packageName], {
      cwd: profileDir,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`dsh-bell-notify: pnpm update failed (${signal ?? String(code)})`))
    })
  })
}

/** Execute the fixed update and reconcile the profile exactly as `dsh plugin` does. */
export async function updateNpmProfilePackage(
  profileDir: string,
  packageName: string,
  update: ProfilePackageUpdater = runPnpmUpdate,
): Promise<void> {
  const before = readProfileManifest(profileDir)
  await update(profileDir, packageName)
  reconcileProfileBundles(profileDir, before)
}
