import {
  deleteBookmark,
  groupByField,
  listBookmarks,
  mergeBookmarkFilters,
  saveBookmark,
  segmentOfTrenchCode,
} from '@/data/bookmarks'
import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionOptions,
  ActionResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  Paginated,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

// 通用分页：页码超出总页数时回收到最后一个可操作页，0 条时回到第 1 页。
export function paginate<T>(rows: T[], page: number, size: number): Paginated<T> {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const requested = Number.isFinite(page) ? Math.floor(page) : 1
  let current = requested
  if (current < 1) {
    current = 1
  }
  const clamped = current > totalPages
  if (clamped) {
    current = totalPages
  }
  return {
    items: rows.slice((current - 1) * size, current * size),
    total,
    page: current,
    size,
    totalPages,
    clamped,
  }
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => {
      // 「状态」是页面分段导航的快捷检索字段，指向行的流转状态，不对应业务列。
      const haystack = field === '状态' ? String(row.status) : String(row[field] ?? '')
      return haystack.includes(value.trim())
    }),
  )
}

export function listEntries(
  key: string,
  filters: Record<string, string> = {},
  page = 1,
  // 不传分页尺寸时保持旧口径：一次返回全部命中。
  size?: number,
): PageResult {
  const matched = filterRows(listRows(key), filters)
  if (size === undefined) {
    return { items: matched, total: matched.length, page: 1, size: matched.length, totalPages: 1 }
  }
  return paginate(matched, page, size)
}

export function runAction(
  key: string,
  id: number,
  action: string,
  options: ActionOptions = {},
): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  // 越权拦截：操作人只允许动自己发掘区的记录。
  if (options.area && meta.areaField) {
    const rowArea = String(rows[index][meta.areaField] ?? '')
    if (rowArea !== options.area) {
      return {
        ok: false,
        message: `越权拦截：该${meta.entity}属于「${rowArea}」，当前发掘区「${options.area}」无权操作`,
      }
    }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)

  const noteCount = applySuspendSideEffects(meta, updated, action)
  let message = `${meta.entity}已${action}，当前状态「${target}」`
  if (noteCount > 0) {
    message += `；相邻地层待补录台账新增 ${noteCount} 条核查事项`
  }
  return { ok: true, message }
}

// 停用联动：把相邻台账模块中引用该探方的记录退回「需补录」并追加核查事项。
function applySuspendSideEffects(
  meta: ModuleMeta,
  source: EntryRow,
  action: string,
): number {
  if (!action.startsWith('停用') || !meta.suspendSideEffects) {
    return 0
  }
  const today = new Date().toISOString().slice(0, 10)
  let count = 0
  for (const effect of meta.suspendSideEffects) {
    const effectMeta = MODULE_BY_KEY.get(effect.module)
    if (!effectMeta) {
      continue
    }
    const relation = String(source['探方编号'] ?? '')
    const targetStatus = effectMeta.statuses.includes('需补录') ? '需补录' : effectMeta.statuses[0]
    const ledger = listRows(effect.module)
    let touched = false
    const nextLedger = ledger.map((row) => {
      if (String(row[effect.relationField] ?? '') !== relation) {
        return row
      }
      touched = true
      count += 1
      const note = `${effect.checkNote}（${today}）`
      const existing = String(row['核查事项'] ?? '').trim()
      const notes = existing ? `${existing}；${note}` : note
      return { ...row, status: targetStatus, pending: true, 核查事项: notes }
    })
    if (touched) {
      saveRows(effect.module, nextLedger)
    }
  }
  return count
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 当班检索书签：透传数据层能力，页面仍只依赖 service 取数。
export {
  deleteBookmark,
  groupByField,
  listBookmarks,
  mergeBookmarkFilters,
  saveBookmark,
  segmentOfTrenchCode,
}
