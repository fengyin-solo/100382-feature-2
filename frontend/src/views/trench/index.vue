<template>
  <section class="page" data-module="trench">
    <header class="page-head">
      <div>
        <h2>探方管理管理</h2>
        <p class="page-desc">维护探方，围绕探方编号、所属发掘区、探方尺寸、发掘层位做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记探方</button>
        <button class="btn" type="button" @click="exportRows">导出探方管理清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="submitFilters">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <label class="filter-item">
        <span>状态</span>
        <select v-model="filters['状态']">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <section class="bookmark-bar">
      <div class="bookmark-current">
        <span class="bookmark-label">当班检索书签</span>
        <select v-model="bookmarkChoice">
          <option value="">选择本班保存的分组条件…</option>
          <option v-for="item in bookmarks" :key="item.id" :value="String(item.id)">
            {{ item.name }}（{{ item.dimension }}·{{ item.group }}）
          </option>
        </select>
        <button class="btn" type="button" :disabled="!bookmarkChoice" @click="applyBookmark">调出</button>
        <button class="btn ghost" type="button" :disabled="!bookmarkChoice" @click="removeBookmark">删除</button>
        <button
          class="btn"
          type="button"
          :disabled="!activeGroup"
          :title="activeGroup ? '' : '先在下方展开一个命中分组'"
          @click="startSaveBookmark"
        >
          把当前分组存为当班书签
        </button>
      </div>
      <form v-if="savingBookmark" class="bookmark-save" @submit.prevent="confirmSaveBookmark">
        <input v-model="bookmarkName" placeholder="书签名称" />
        <button class="btn primary" type="submit">保存</button>
        <button class="btn ghost" type="button" @click="savingBookmark = false">取消</button>
      </form>
      <p v-if="activeBookmark" class="bookmark-hint">
        已调用书签「{{ activeBookmark.name }}」（{{ activeBookmark.shift }} · {{ activeBookmark.operator }}）
      </p>
    </section>

    <section class="segment-nav">
      <div class="segment-tabs">
        <button
          v-for="dim in dimensions"
          :key="dim.key"
          class="segment-tab"
          :class="{ active: activeDim === dim.key }"
          type="button"
          @click="switchDimension(dim.key)"
        >
          {{ dim.label }}
        </button>
      </div>
      <ul class="segment-list">
        <li v-for="group in groups" :key="group.key">
          <button
            class="segment-head"
            :class="{ open: openGroupKey === group.key }"
            type="button"
            @click="toggleGroup(group.key)"
          >
            <span class="segment-caret">{{ openGroupKey === group.key ? '▾' : '▸' }}</span>
            <span class="segment-name">{{ dimLabel }}：{{ group.key }}</span>
            <span class="segment-count">{{ group.rows.length }} 条</span>
          </button>
          <table v-if="openGroupKey === group.key" class="data-table segment-table">
            <thead>
              <tr>
                <th v-for="column in columns" :key="column">{{ column }}</th>
                <th>当前状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="String(row.id)">
                <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
                <td>{{ row.status }}</td>
                <td class="row-actions">
                  <button class="link" type="button" @click="openDetail(row)">进入探方</button>
                </td>
              </tr>
              <tr v-if="!group.rows.length">
                <td :colspan="columns.length + 2" class="empty-state">本页没有落入该分组的探方</td>
              </tr>
            </tbody>
          </table>
        </li>
        <li v-if="!groups.length" class="empty-state">当前条件下没有可切换的命中分组</li>
      </ul>
    </section>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <button class="link" type="button" @click="openDetail(row)">进入</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无探方管理数据，可先登记探方</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot pagination">
      <div class="pager">
        <button class="btn" type="button" :disabled="page <= 1" @click="gotoPage(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button class="btn" type="button" :disabled="page >= totalPages" @click="gotoPage(page + 1)">下一页</button>
        <span>共 {{ total }} 条探方管理记录，每页 {{ PAGE_SIZE }} 条</span>
      </div>
      <span v-if="infoMessage" class="info-text">{{ infoMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="detail" class="drawer-mask" @click.self="closeDetail">
      <aside class="drawer">
        <header class="drawer-head">
          <h3>探方详情 · {{ detail['探方编号'] }}</h3>
          <button class="link" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="drawer-body">
          <div v-for="column in columns" :key="column" class="drawer-row">
            <dt>{{ column }}</dt>
            <dd>{{ detail[column] || '—' }}</dd>
          </div>
          <div class="drawer-row">
            <dt>当前状态</dt>
            <dd>{{ detail.status }}</dd>
          </div>
        </dl>
        <footer class="drawer-actions">
          <button
            v-for="action in actions"
            :key="action"
            class="btn"
            type="button"
            @click="runAction(action, detail)"
          >
            {{ action }}
          </button>
        </footer>
        <p v-if="detailMessage" class="drawer-message" :class="{ 'error-text': actionFailed }">{{ detailMessage }}</p>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  downloadEntries,
  groupByField,
  listBookmarks,
  listEntries,
  mergeBookmarkFilters,
  moduleMeta,
  runAction as applyAction,
  saveBookmark,
  deleteBookmark,
} from '@/api/local-service'
import { groupByTrenchSegment, type ShiftBookmark } from '@/data/bookmarks'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const meta = moduleMeta('trench')
const columns = ["探方编号", "所属发掘区", "探方尺寸", "发掘层位", "负责人", "开工日期", "完成日期", "探方状态"]
const actions = ["开始发掘", "确认到底", "安排回填", "停用探方"]
const statuses = ["待发掘", "发掘中", "已到底", "已回填", "暂停"]
// 分页固定每页 5 条：页码超出总页数时由 service 层回收到最后一个可操作页。
const PAGE_SIZE = 5

const dimensions = [
  { key: 'code', label: '探方编号段' },
  { key: 'area', label: '发掘区' },
  { key: 'status', label: '状态' },
] as const
type DimensionKey = (typeof dimensions)[number]['key']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const errorMessage = ref('')
const infoMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const activeDim = ref<DimensionKey>('code')
const openGroupKey = ref<string>('')
const bookmarks = ref<ShiftBookmark[]>([])
const bookmarkChoice = ref('')
const activeBookmarkId = ref<number | null>(null)
const savingBookmark = ref(false)
const bookmarkName = ref('')

const detail = ref<EntryRow | null>(null)
const detailMessage = ref('')
const actionFailed = ref(false)
// 列表数据来自 localStorage，手动维护版本号驱动统计卡片刷新。
const dataVersion = ref(0)
// syncUrl 自己触发的路由变化不需要再回灌状态，只有浏览器前进/后退才重新取数。
let syncingUrl = false

const activeBookmark = computed(
  () => bookmarks.value.find((item) => item.id === activeBookmarkId.value) ?? null,
)

const dimLabel = computed(
  () => dimensions.find((item) => item.key === activeDim.value)?.label ?? '',
)

// 口径：手工条件优先于书签条件，书签只补齐手工未填的字段，冲突时以手工为准。
const effectiveFilters = computed(() => {
  if (!activeBookmark.value) {
    return { ...filters.value }
  }
  const { filters: merged } = mergeBookmarkFilters(activeBookmark.value, filters.value)
  return merged
})

const activeGroup = computed(() => groups.value.find((item) => item.key === openGroupKey.value) ?? null)

const groups = computed<{ key: string; rows: EntryRow[] }[]>(() => {
  const map =
    activeDim.value === 'code'
      ? groupByTrenchSegment(rows.value)
      : activeDim.value === 'area'
        ? groupByField(rows.value, '所属发掘区')
        : groupByField(rows.value, 'status')
  const keys = [...map.keys()]
  if (activeDim.value === 'status') {
    keys.sort((a, b) => statuses.indexOf(a) - statuses.indexOf(b))
  } else {
    keys.sort()
  }
  return keys.map((key) => ({ key, rows: map.get(key) ?? [] }))
})

const stats = computed(() => {
  void dataVersion.value
  const all = listEntries(meta.key).items
  return [
    { label: '探方总数', value: all.length },
    { label: '发掘中探方', value: all.filter((row) => row.status === '发掘中').length },
    { label: '已到底探方', value: all.filter((row) => row.status === '已到底').length },
  ]
})

const statusSummary = computed(() =>
  statuses.map((status: string) => {
    void dataVersion.value
    return {
      status,
      count: listEntries(meta.key).items.filter((row) => String(row.status) === status).length,
    }
  }),
)

function reload() {
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    const payload = listEntries(meta.key, effectiveFilters.value, page.value, PAGE_SIZE)
    rows.value = payload.items
    total.value = payload.total
    totalPages.value = payload.totalPages
    if (payload.clamped) {
      page.value = payload.page
      infoMessage.value = `页码超出总页数，已回到可操作的第 ${payload.page} 页`
    }
    dataVersion.value += 1
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '探方管理列表读取失败'
  }
  syncUrl()
}

function submitFilters() {
  page.value = 1
  reload()
}

function resetFilters() {
  filters.value = {}
  activeBookmarkId.value = null
  bookmarkChoice.value = ''
  page.value = 1
  reload()
}

function gotoPage(target: number) {
  page.value = target
  reload()
}

function switchDimension(key: DimensionKey) {
  activeDim.value = key
  openGroupKey.value = ''
  syncUrl()
}

function toggleGroup(key: string) {
  openGroupKey.value = openGroupKey.value === key ? '' : key
  syncUrl()
}

function refreshBookmarks() {
  bookmarks.value = listBookmarks()
}

function startSaveBookmark() {
  if (!activeGroup.value) {
    return
  }
  bookmarkName.value = `${dimLabel.value}·${activeGroup.value.key}`
  savingBookmark.value = true
}

function groupBookmarkFilters(key: string): Record<string, string> {
  if (activeDim.value === 'code') {
    return { 探方编号: key }
  }
  if (activeDim.value === 'area') {
    return { 所属发掘区: key }
  }
  return { 状态: key }
}

function confirmSaveBookmark() {
  const group = activeGroup.value
  if (!group) {
    return
  }
  const name = bookmarkName.value.trim() || `${dimLabel.value}·${group.key}`
  const saved = saveBookmark({
    name,
    shift: session.shiftLabel,
    operator: session.operator,
    dimension: dimLabel.value,
    group: group.key,
    filters: groupBookmarkFilters(group.key),
  })
  savingBookmark.value = false
  refreshBookmarks()
  activeBookmarkId.value = saved.id
  bookmarkChoice.value = String(saved.id)
  reload()
  infoMessage.value = `当班书签「${name}」已保存，本班组下次可直接调出`
}

function applyBookmark() {
  const id = Number(bookmarkChoice.value)
  const bookmark = bookmarks.value.find((item) => item.id === id)
  if (!bookmark) {
    return
  }
  activeBookmarkId.value = bookmark.id
  page.value = 1
  const dim = dimensions.find((item) => item.label === bookmark.dimension)
  if (dim) {
    activeDim.value = dim.key
    openGroupKey.value = bookmark.group
  }
  const { conflicts } = mergeBookmarkFilters(bookmark, filters.value)
  reload()
  infoMessage.value =
    conflicts.length > 0
      ? `手工条件与书签在「${conflicts.join('、')}」上冲突，已按手工条件口径执行`
      : `已调用书签「${bookmark.name}」`
}

function removeBookmark() {
  const id = Number(bookmarkChoice.value)
  if (!id) {
    return
  }
  deleteBookmark(id)
  if (activeBookmarkId.value === id) {
    activeBookmarkId.value = null
  }
  bookmarkChoice.value = ''
  refreshBookmarks()
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '探方登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  detailMessage.value = ''
  actionFailed.value = false
  // 越权拦截口径放在 service 层：带上当前值班发掘区，跨区探方一律打回。
  const result = applyAction(meta.key, Number(row.id), action, { area: session.area })
  if (!result.ok) {
    errorMessage.value = result.message
    detailMessage.value = result.message
    actionFailed.value = true
    return
  }
  reload()
  // 成功提示在 reload 之后写，避免被重新取数时清空。
  infoMessage.value = result.message
  detailMessage.value = result.message
  if (detail.value && Number(detail.value.id) === Number(row.id)) {
    const updated = listEntries(meta.key).items.find((item) => Number(item.id) === Number(row.id))
    if (updated) {
      detail.value = updated
    }
  }
}

function openDetail(row: EntryRow) {
  detail.value = row
  detailMessage.value = ''
  actionFailed.value = false
}

function closeDetail() {
  detail.value = null
}

// 旧查询参数（探方编号/所属发掘区/探方尺寸）继续可读，新增参数用 dim/group/page/bm 短名。
const QUERY_FILTER_FIELDS = ['探方编号', '所属发掘区', '探方尺寸', '状态']

function canonicalQuery(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') {
      params.set(key, value)
    }
  }
  return params
}

function stateToQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  for (const field of QUERY_FILTER_FIELDS) {
    const value = filters.value[field]
    if (value && value.trim() !== '') {
      query[field] = value.trim()
    }
  }
  if (page.value > 1) {
    query.page = String(page.value)
  }
  if (activeDim.value !== 'code') {
    query.dim = activeDim.value
  }
  if (openGroupKey.value) {
    query.group = openGroupKey.value
  }
  if (activeBookmarkId.value !== null) {
    query.bm = String(activeBookmarkId.value)
  }
  return query
}

function applyRouteToState() {
  const next: Record<string, string> = {}
  for (const field of QUERY_FILTER_FIELDS) {
    const value = route.query[field]
    if (typeof value === 'string' && value.trim() !== '') {
      next[field] = value
    }
  }
  filters.value = next
  const queryPage = Number(route.query.page)
  page.value = Number.isFinite(queryPage) && queryPage >= 1 ? Math.floor(queryPage) : 1
  const dim = route.query.dim
  activeDim.value = dimensions.some((item) => item.key === dim) ? (dim as DimensionKey) : 'code'
  openGroupKey.value = typeof route.query.group === 'string' ? route.query.group : ''
  const bm = Number(route.query.bm)
  activeBookmarkId.value = Number.isFinite(bm) && bm > 0 ? bm : null
  bookmarkChoice.value = activeBookmarkId.value ? String(activeBookmarkId.value) : ''
  reload()
}

function syncUrl() {
  const target = canonicalQuery(stateToQuery()).toString()
  const current = canonicalQuery(route.query as Record<string, unknown>).toString()
  if (target !== current) {
    const query = stateToQuery()
    syncingUrl = true
    router.replace({ path: route.path, query: Object.keys(query).length ? query : {} })
  }
}

watch(
  () => route.query,
  () => {
    if (syncingUrl) {
      syncingUrl = false
      return
    }
    const target = canonicalQuery(stateToQuery()).toString()
    const current = canonicalQuery(route.query as Record<string, unknown>).toString()
    if (target !== current) {
      applyRouteToState()
    }
  },
)

onMounted(() => {
  refreshBookmarks()
  applyRouteToState()
})
</script>
