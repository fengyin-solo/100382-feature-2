import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  listRows,
  loadDocuments,
  resetRows,
  saveDocuments,
  saveRows,
} from '@/data/local-store'
import type {
  ActionContext,
  ActionResult,
  EntryRow,
  ListOptions,
  ModuleMeta,
  OverviewResult,
  PageResult,
  ShiftBookmark,
  StratumCheck,
  TrenchGroup,
  TrenchGroupDimension,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

const TRENCH_KEY = 'trench'
const STRATUM_KEY = 'stratum'
const DEACTIVATED_STATUS = '已停用'
const STRATUM_PENDING_STATUS = '需补录'

const SHIFT_BOOKMARK_KEY = 'field-archaeology-digital:trench-shift-bookmarks'
const STRATUM_CHECK_KEY = 'field-archaeology-digital:stratum-deactivation-checks'

// 分段导航维度 → 命中分组所依据的行字段；status 直接取记录的状态属性。
const GROUP_FIELD: Record<TrenchGroupDimension, string> = {
  code: '探方编号',
  area: '所属发掘区',
  status: 'status',
}

export const TRENCH_DIMENSION_LABEL: Record<TrenchGroupDimension, string> = {
  code: '探方编号',
  area: '发掘区',
  status: '状态',
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

/**
 * 手工条件与书签条件的合并口径：书签字段优先（冲突时覆盖同名手工条件），
 * 书签未涉及的手工条件继续保留做交集。旧查询参数（探方编号/所属发掘区/status）
 * 仍是普通键值对，回填到检索框即可读。
 */
export function mergeFilters(
  manual: Record<string, string>,
  bookmark?: Record<string, string>,
): Record<string, string> {
  if (!bookmark) {
    return { ...manual }
  }
  return { ...manual, ...bookmark }
}

/** 分页收口：页码非法或超出总页数时回到可操作页（首页或末页）。 */
export function paginateRows(rows: EntryRow[], page?: number, size?: number): PageResult {
  const total = rows.length
  // 不传分页参数时保持旧口径：一页返回全部命中。
  if (size === undefined || size <= 0) {
    return { items: rows, total, page: 1, size: total, totalPages: total > 0 ? 1 : 0 }
  }
  const totalPages = Math.max(1, Math.ceil(total / size))
  let safePage = Number.isFinite(page) ? Math.floor(page ?? 1) : 1
  if (safePage < 1) {
    safePage = 1
  }
  if (safePage > totalPages) {
    safePage = totalPages
  }
  const start = (safePage - 1) * size
  return {
    items: rows.slice(start, start + size),
    total,
    page: safePage,
    size,
    totalPages,
  }
}

export function listEntries(
  key: string,
  filters: Record<string, string> = {},
  options?: ListOptions,
): PageResult {
  const matched = filterRows(listRows(key), filters)
  return paginateRows(matched, options?.page, options?.size)
}

/**
 * 探方分段导航：在既有筛选结果上按探方编号 / 发掘区 / 状态切分命中分组，
 * 组内行仍来自 listRows('trench') + filterRows，不另开取数路径。
 */
export function buildTrenchGroups(
  dimension: TrenchGroupDimension,
  filters: Record<string, string>,
): TrenchGroup[] {
  const field = GROUP_FIELD[dimension]
  const buckets = new Map<string, EntryRow[]>()
  for (const row of filterRows(listRows(TRENCH_KEY), filters)) {
    const key = String(row[field] ?? '未填写') || '未填写'
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      buckets.set(key, [row])
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'))
    .map(([key, bucketRows]) => ({
      dimension,
      key,
      label: key,
      count: bucketRows.length,
      rows: [...bucketRows].sort((left, right) =>
        String(left['探方编号'] ?? '').localeCompare(String(right['探方编号'] ?? ''), 'zh-Hans-CN'),
      ),
    }))
}

/** 分组对应的检索条件：点开分组即按该条件进入单条探方列表。 */
export function groupFilters(
  dimension: TrenchGroupDimension,
  groupKey: string,
): Record<string, string> {
  return { [GROUP_FIELD[dimension]]: groupKey }
}

/** 当班检索书签：读取当前班保存的分组口径。 */
export function listShiftBookmarks(): ShiftBookmark[] {
  return loadDocuments<ShiftBookmark>(SHIFT_BOOKMARK_KEY).sort((left, right) => right.id - left.id)
}

export function saveShiftBookmark(input: Omit<ShiftBookmark, 'id' | 'createdAt'>): ShiftBookmark {
  const bookmarks = loadDocuments<ShiftBookmark>(SHIFT_BOOKMARK_KEY)
  const bookmark: ShiftBookmark = {
    ...input,
    id: bookmarks.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    createdAt: new Date().toISOString(),
  }
  saveDocuments(SHIFT_BOOKMARK_KEY, [bookmark, ...bookmarks])
  return bookmark
}

export function deleteShiftBookmark(id: number): void {
  saveDocuments(
    SHIFT_BOOKMARK_KEY,
    loadDocuments<ShiftBookmark>(SHIFT_BOOKMARK_KEY).filter((item) => item.id !== id),
  )
}

/** 停用探方后，相邻入口（地层待补录台账）新增核查事项。 */
function createDeactivationChecks(row: EntryRow): number {
  const trenchCode = String(row['探方编号'] ?? '')
  const area = String(row['所属发掘区'] ?? '')
  const pendingStrata = listRows(STRATUM_KEY).filter(
    (item) =>
      String(item['所属探方'] ?? '') === trenchCode &&
      String(item.status) === STRATUM_PENDING_STATUS,
  )
  const existing = loadDocuments<StratumCheck>(STRATUM_CHECK_KEY)
  const now = new Date().toISOString()
  const additions: StratumCheck[] = []
  const appendCheck = (stratumCode: string, reason: string) => {
    const duplicated = existing.some(
      (item) =>
        !item.resolved && item.trenchCode === trenchCode && item.stratumCode === stratumCode,
    )
    if (!duplicated) {
      additions.push({
        id: existing.length + additions.length + 1,
        trenchCode,
        area,
        stratumCode,
        reason,
        createdAt: now,
        resolved: false,
      })
    }
  }
  if (pendingStrata.length > 0) {
    for (const stratum of pendingStrata) {
      appendCheck(
        String(stratum['地层编号'] ?? ''),
        `所属探方已停用，该地层仍为「${STRATUM_PENDING_STATUS}」，停用前核查补录内容并移交地层台账`,
      )
    }
  } else {
    appendCheck(
      '—',
      '停用核查：该探方无处于「需补录」的地层，确认地层台账已随探方停用一并移交归档',
    )
  }
  if (additions.length > 0) {
    saveDocuments(STRATUM_CHECK_KEY, [...existing, ...additions])
  }
  return additions.length
}

export function listStratumChecks(includeResolved = false): StratumCheck[] {
  const checks = loadDocuments<StratumCheck>(STRATUM_CHECK_KEY)
  return checks
    .filter((item) => includeResolved || !item.resolved)
    .sort((left, right) => Number(left.resolved) - Number(right.resolved) || right.id - left.id)
}

export function resolveStratumCheck(id: number): void {
  const checks = loadDocuments<StratumCheck>(STRATUM_CHECK_KEY)
  saveDocuments(
    STRATUM_CHECK_KEY,
    checks.map((item) => (item.id === id ? { ...item, resolved: true } : item)),
  )
}

export function runAction(
  key: string,
  id: number,
  action: string,
  context: ActionContext = {},
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
  // 越权拦截：探方只能由所属发掘区当班人员操作，其他发掘区一律拒绝写操作。
  if (key === TRENCH_KEY && context.permittedAreas && context.permittedAreas.length > 0) {
    const area = String(rows[index]['所属发掘区'] ?? '')
    if (!context.permittedAreas.includes(area)) {
      return {
        ok: false,
        message: `越权拦截：该探方属于「${area}」，本班仅可操作「${context.permittedAreas.join('、')}」，已拒绝修改`,
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
  let message = `${meta.entity}已${action}，当前状态「${target}」`
  // 停用探方：沿既有地层关联（地层.所属探方 = 探方.探方编号）挂核查事项。
  if (key === TRENCH_KEY && target === DEACTIVATED_STATUS) {
    const created = createDeactivationChecks(updated)
    message +=
      created > 0
        ? `；地层待补录台账已新增 ${created} 项停用核查事项`
        : '；地层待补录台账已有未结核查事项，未重复登记'
  }
  return { ok: true, message }
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
