/**
 * Keeps the last-loaded CSV between visits.
 * Uses IndexedDB rather than localStorage, which is limited to about 5 MB.
 */

const DB_NAME = "data-explorer"
const STORE = "files"
const KEY = "last-csv"

export interface SavedFile {
  name: string
  text: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveLastFile(file: SavedFile): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(file, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    // Not fatal: the file is still shown, it just won't be remembered
    console.warn("Could not save file for next visit:", err)
  }
}

export async function loadLastFile(): Promise<SavedFile | null> {
  try {
    const db = await openDB()
    const saved = await new Promise<SavedFile | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (saved) return saved

    // One-off migration from the old localStorage copy
    const text = localStorage.getItem("lastCSVData")
    const name = localStorage.getItem("lastCSVFileName")
    if (text && name) {
      await saveLastFile({ name, text })
      localStorage.removeItem("lastCSVData")
      localStorage.removeItem("lastCSVFileName")
      return { name, text }
    }
  } catch (err) {
    console.warn("Could not load saved file:", err)
  }
  return null
}

// ------------------------------------------------------------
// Tree view settings (small, so localStorage is fine)
// ------------------------------------------------------------

export function readSetting<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore: settings just won't persist
  }
}
