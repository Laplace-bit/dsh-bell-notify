/**
 * 二进制声音文件存储（platform 层，IndexedDB）。
 *
 * SoundAssignments 只在 localStorage 存「事件 → 键」元数据；真正的文件字节
 * 存在这里（IndexedDB），键为 `custom:<id>`。上传的音频解码成 PCM 后仍以原
 * 文件 blob 落库，试听/播放时再由 WebAudioPlayer.decodeSound 解码，避免在
 * storage 层耦合 WebAudio 与解码细节。
 */

import type { SoundFileStorage } from '../core/sound-assignments'

const DB_NAME = 'dsh-bell-notify'
const STORE_NAME = 'custom-sounds'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

/** 浏览器 IndexedDB 实现；不可用时（SSR/隐私模式）退化为 null。 */
export function createIndexedDbSoundStorage(): SoundFileStorage | null {
  if (typeof indexedDB === 'undefined') return null

  let dbPromise: Promise<IDBDatabase> | null = null
  const db = (): Promise<IDBDatabase> => (dbPromise ??= openDb())

  return {
    async put(key, blob) {
      const database = await db()
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(blob, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'))
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB put aborted'))
      })
    },
    async get(key) {
      const database = await db()
      return new Promise<Blob | null>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve((req.result as Blob) ?? null)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'))
      })
    },
    async remove(key) {
      const database = await db()
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB remove failed'))
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB remove aborted'))
      })
    },
  }
}
