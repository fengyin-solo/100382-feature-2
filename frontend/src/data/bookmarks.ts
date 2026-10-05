import type { EntryRow } from './types'

// 当班检索书签：保存当前命中分组对应的检索条件，换班后可直接调出。
export type ShiftBookmark = {
  id: number
  name: string
  shift: string
  operator: string
  dimension: string
  group: string
  filters: Record<string, string>
  createdAt: string
}

const STORAGE_KEY = 'field-archaeology-digital:shift-bookmarks'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): ShiftBookmark[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ShiftBookmark[]) : []
  } catch {
    return []
  }
}

let cache: ShiftBookmark[] | null = null

export function listBookmarks(): ShiftBookmark[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(rows: ShiftBookmark[]): void {
  cache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

export function saveBookmark(
  draft: Omit<ShiftBookmark, 'id' | 'createdAt'>,
): ShiftBookmark {
  const rows = listBookmarks()
  const bookmark: ShiftBookmark = {
    ...clone(draft),
    id: rows.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    createdAt: new Date().toISOString(),
  }
  persist([...rows, bookmark])
  return bookmark
}

export function deleteBookmark(id: number): void {
  persist(listBookmarks().filter((item) => item.id !== id))
}

// 书签与当前手工条件合并：手工已填的字段以手工为准，书签只补空白字段。
export function mergeBookmarkFilters(
  bookmark: ShiftBookmark,
  manual: Record<string, string>,
): { filters: Record<string, string>; conflicts: string[] } {
  const filters: Record<string, string> = { ...clone(bookmark.filters) }
  const conflicts: string[] = []
  for (const [field, value] of Object.entries(manual)) {
    if (value.trim() === '') {
      continue
    }
    if (filters[field] !== undefined && filters[field] !== value) {
      conflicts.push(field)
    }
    filters[field] = value
  }
  return { filters, conflicts }
}

// 供页面复用的命中分组规则：按字段值分组（发掘区、状态）。
export function groupByField(rows: EntryRow[], field: string): Map<string, EntryRow[]> {
  const groups = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const key = String(row[field] ?? '未填写')
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      groups.set(key, [row])
    }
  }
  return groups
}

// 探方编号分段：取「前缀-编号前两位」作为段，例如 TREN-0207 归入 TREN-02 段。
export function segmentOfTrenchCode(code: string): string {
  const match = /^([A-Za-z]+-\d{2})/u.exec(code.trim())
  return match ? match[1].toUpperCase() : '其他编号段'
}

export function groupByTrenchSegment(rows: EntryRow[]): Map<string, EntryRow[]> {
  return rows.reduce((groups, row) => {
    const key = segmentOfTrenchCode(String(row['探方编号'] ?? ''))
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      groups.set(key, [row])
    }
    return groups
  }, new Map<string, EntryRow[]>())
}
