/** Host-only package metadata. The installed package manifest is the source of truth. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageManifest {
  name?: unknown
  version?: unknown
}

function packageManifestPath(): string {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  } catch {
    return join(process.cwd(), 'package.json')
  }
}

const manifest = JSON.parse(readFileSync(packageManifestPath(), 'utf8')) as PackageManifest

function required(field: keyof PackageManifest): string {
  const value = manifest[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`dsh-bell-notify: package.json must contain a non-empty ${field}`)
  }
  return value
}

/** Name used in profile manifests. */
export const BELL_PACKAGE_NAME = required('name')

/** Version of the code currently executing in the Host process. */
export const BELL_PACKAGE_VERSION = required('version')
