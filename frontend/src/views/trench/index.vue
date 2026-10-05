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

    <div class="scope-bar">
      <span class="scope-label">本班可操作发掘区：</span>
      <label v-for="area in areaOptions" :key="area" class="scope-tag">
        <input
          type="checkbox"
          :value="area"
          :checked="session.permittedAreas.includes(area)"
          @change="toggleArea(area)"
        />
        {{ area }}
      </label>
      <span v-if="!session.permittedAreas.length" class="scope-hint">未限定发掘区（不做越权校验）</span>
      <span class="scope-hint">越区探方的状态动作会被拦截</span>
    </div>

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

    <form class="filter-bar" @submit.prevent="commitSearch">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="activeBookmark" class="bookmark-banner">
      <span>
        当班书签「{{ activeBookmark.name }}」生效中（{{ activeBookmark.shift }}）：
        冲突字段以书签为准，手工条件已按书签口径回填。
      </span>
      <button class="link" type="button" @click="clearBookmark">退出书签</button>
    </div>
    <div v-else-if="bookmarks.length" class="bookmark-banner idle">
      <span>已保存 {{ bookmarks.length }} 个当班检索书签，可在下方直接套用。</span>
    </div>

    <!-- 分段导航：探方编号 / 发掘区 / 状态 三个维度切换命中分组 -->
    <nav class="segment-nav">
      <button
        v-for="item in dimensionOptions"
        :key="item.value"
        class="segment-tab"
        :class="{ active: dimension === item.value }"
        type="button"
        @click="switchDimension(item.value)"
      >
        按{{ item.label }}分组
      </button>
    </nav>

    <div v-if="!activeGroup" class="group-grid">
      <button
        v-for="group in groups"
        :key="group.key"
        class="group-card"
        type="button"
        @click="openGroup(group.key)"
      >
        <span class="group-name">{{ group.label }}</span>
        <span class="group-count">{{ group.count }} 条命中</span>
      </button>
      <p v-if="!groups.length" class="empty-state">当前检索条件下没有命中的探方分组</p>
    </div>

    <section v-else class="drill-panel">
      <div class="drill-head">
        <button class="btn ghost" type="button" @click="closeGroup">← 返回分段导航</button>
        <h3>
          分组：{{ activeGroup.label }}
          <span class="group-count">（{{ activeGroup.count }} 条探方）</span>
        </h3>
        <button class="btn" type="button" :disabled="!activeGroup" @click="bookmarkCurrentGroup">
          保存为当班检索书签
        </button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>可执行动作</th>
            <th>单条</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)">
            <td v-for="column in columns" :key="column">
              <button
                v-if="column === '探方编号'"
                class="link"
                type="button"
                @click="openDetail(row)"
              >
                {{ row[column] ?? '—' }}
              </button>
              <template v-else>{{ row[column] ?? '—' }}</template>
            </td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <button
                v-for="action in actions"
                :key="action"
                class="link"
                :class="{ danger: action === '停用' }"
                type="button"
                @click="runAction(action, row)"
              >
                {{ action }}
              </button>
            </td>
            <td>
              <button class="link" type="button" @click="openDetail(row)">进入</button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 3" class="empty-state">该分组下暂无探方管理数据</td>
          </tr>
        </tbody>
      </table>

      <div class="pager">
        <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ totalPages || 1 }} 页 · 共 {{ total }} 条</span>
        <button
          class="btn"
          type="button"
          :disabled="page >= totalPages"
          @click="goPage(page + 1)"
        >
          下一页
        </button>
        <span class="pager-jump">
          跳至
          <input v-model.number="jumpPage" type="number" min="1" @keyup.enter="jumpToPage" />
          页
          <button class="btn ghost" type="button" @click="jumpToPage">跳转</button>
        </span>
      </div>
    </section>

    <div v-if="bookmarks.length" class="bookmark-list">
      <h4>当班检索书签</h4>
      <ul>
        <li v-for="bookmark in bookmarks" :key="bookmark.id" :class="{ current: bookmark.id === activeBookmarkId }">
          <button class="link" type="button" @click="applyBookmark(bookmark)">
            {{ bookmark.name }}
          </button>
          <span class="bookmark-meta">
            按{{ dimensionLabel(bookmark.dimension) }} · {{ bookmark.groupKey }} · {{ bookmark.shift }}
          </span>
          <button class="link danger" type="button" @click="removeBookmark(bookmark.id)">删除</button>
        </li>
      </ul>
    </div>

    <div v-if="detailRow" class="detail-mask" @click.self="closeDetail">
      <article class="detail-card">
        <header class="detail-head">
          <h3>探方 {{ detailRow['探方编号'] }}</h3>
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-grid">
          <template v-for="column in columns" :key="column">
            <dt>{{ column }}</dt>
            <dd>{{ detailRow[column] ?? '—' }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ detailRow.status }}</dd>
        </dl>
        <div class="detail-actions">
          <button
            v-for="action in actions"
            :key="action"
            class="btn"
            :class="{ primary: action !== '停用' }"
            type="button"
            @click="runAction(action, detailRow)"
          >
            {{ action }}
          </button>
        </div>
      </article>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 条探方管理记录</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  buildTrenchGroups,
  deleteShiftBookmark,
  downloadEntries,
  groupFilters,
  listEntries,
  listShiftBookmarks,
  mergeFilters,
  moduleMeta,
  runAction as applyAction,
  saveShiftBookmark,
  TRENCH_DIMENSION_LABEL,
} from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import type { EntryRow, ShiftBookmark, TrenchGroupDimension } from '@/data/types'

const meta = moduleMeta('trench')
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const columns = meta.fields
const filterFields = ['探方编号', '所属发掘区', '探方尺寸']
const actions = meta.actions
const statuses = meta.statuses
const PAGE_SIZE = 5
const dimensionOptions = (Object.keys(TRENCH_DIMENSION_LABEL) as TrenchGroupDimension[]).map(
  (value) => ({ value, label: TRENCH_DIMENSION_LABEL[value] }),
)

// 手工录入的检索条件（旧查询参数口径：探方编号/所属发掘区/探方尺寸）。
const filters = reactive<Record<string, string>>({})
// 查询按钮提交后的手工条件；输入过程中不影响分段与列表。
const committedFilters = ref<Record<string, string>>({})
const dimension = ref<TrenchGroupDimension>('status')
const activeGroupKey = ref('')
const activeBookmarkId = ref<number | null>(null)
const page = ref(1)
const jumpPage = ref<number | null>(null)

const rows = ref<EntryRow[]>([])
const total = ref(0)
const totalPages = ref(1)
const errorMessage = ref('')
const noticeMessage = ref('')
const bookmarks = ref<ShiftBookmark[]>(listShiftBookmarks())
const detailRow = ref<EntryRow | null>(null)

const activeBookmark = computed(
  () => bookmarks.value.find((item) => item.id === activeBookmarkId.value) ?? null,
)

// 口径：书签条件覆盖同名手工条件（书签优先），书签未涉及的手工条件继续取交集。
const effectiveFilters = computed(() =>
  mergeFilters(committedFilters.value, activeBookmark.value?.filters),
)

const groups = computed(() => buildTrenchGroups(dimension.value, effectiveFilters.value))
const activeGroup = computed(
  () => groups.value.find((group) => group.key === activeGroupKey.value) ?? null,
)
const drillFilters = computed(() =>
  activeGroup.value
    ? mergeFilters(effectiveFilters.value, groupFilters(dimension.value, activeGroup.value.key))
    : {},
)

const matchedRows = computed(() => groups.value.flatMap((group) => group.rows))
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: matchedRows.value.filter((row) => String(row.status) === status).length,
  })),
)
const stats = computed(() => [
  { label: '探方总数', value: matchedRows.value.length },
  {
    label: '发掘中探方',
    value: matchedRows.value.filter((row) => String(row.status) === '发掘中').length,
  },
  {
    label: '已到底探方',
    value: matchedRows.value.filter((row) => String(row.status) === '已到底').length,
  },
])

// 发掘区候选取自探方数据本身，沿用 listRows 取数，不额外造字典。
const areaOptions = computed(() =>
  [...new Set(buildTrenchGroups('area', {}).map((group) => group.key))].sort((left, right) =>
    left.localeCompare(right, 'zh-Hans-CN'),
  ),
)

function dimensionLabel(value: TrenchGroupDimension): string {
  return TRENCH_DIMENSION_LABEL[value]
}

function commitSearch() {
  committedFilters.value = { ...filters }
  page.value = 1
  noticeMessage.value = ''
}

function resetFilters() {
  for (const key of Object.keys(filters)) {
    delete filters[key]
  }
  committedFilters.value = {}
  activeBookmarkId.value = null
  page.value = 1
  noticeMessage.value = ''
}

function switchDimension(next: TrenchGroupDimension) {
  dimension.value = next
  activeGroupKey.value = ''
  page.value = 1
}

function openGroup(key: string) {
  activeGroupKey.value = key
  page.value = 1
}

function closeGroup() {
  activeGroupKey.value = ''
  detailRow.value = null
}

function reload() {
  errorMessage.value = ''
  if (!activeGroup.value) {
    rows.value = []
    total.value = 0
    totalPages.value = 1
    return
  }
  try {
    const payload = listEntries(meta.key, drillFilters.value, {
      page: page.value,
      size: PAGE_SIZE,
    })
    if (payload.page !== page.value) {
      noticeMessage.value = `页码超出总页数，已回到第 ${payload.page} 页`
      page.value = payload.page
    }
    rows.value = payload.items
    total.value = payload.total
    totalPages.value = payload.totalPages
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '探方管理列表读取失败'
  }
}

function goPage(target: number) {
  page.value = target
}

function jumpToPage() {
  const target = Number(jumpPage.value)
  if (Number.isFinite(target) && target > 0) {
    page.value = Math.floor(target)
  }
  jumpPage.value = null
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '探方登记入口尚未接入审批流'
}

function toggleArea(area: string) {
  const current = session.permittedAreas
  const next = current.includes(area)
    ? current.filter((item) => item !== area)
    : [...current, area]
  session.setPermittedAreas(next)
}

function syncDetail(updated: EntryRow) {
  if (!detailRow.value) {
    return
  }
  const latest =
    activeGroup.value?.rows.find((row) => Number(row.id) === Number(updated.id)) ?? null
  detailRow.value = latest
  if (!latest) {
    noticeMessage.value = '该探方已不在当前分组内，单条详情已关闭'
  }
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action, {
    permittedAreas: session.permittedAreas,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
  syncDetail(row)
}

function openDetail(row: EntryRow) {
  detailRow.value = row
}

function closeDetail() {
  detailRow.value = null
}

function bookmarkCurrentGroup() {
  if (!activeGroup.value) {
    errorMessage.value = '请先点开一个分组，再保存为当班检索书签'
    return
  }
  const saved = saveShiftBookmark({
    name: `${TRENCH_DIMENSION_LABEL[dimension.value]}·${activeGroup.value.label}`,
    shift: session.shiftLabel,
    dimension: dimension.value,
    groupKey: activeGroup.value.key,
    filters: effectiveFilters.value,
  })
  bookmarks.value = listShiftBookmarks()
  activeBookmarkId.value = saved.id
  noticeMessage.value = `已保存当班检索书签「${saved.name}」`
}

function applyBookmark(bookmark: ShiftBookmark) {
  dimension.value = bookmark.dimension
  // 书签字段优先：手工检索框按书签口径回填，旧参数仍然可读。
  for (const key of Object.keys(filters)) {
    delete filters[key]
  }
  Object.assign(filters, bookmark.filters)
  committedFilters.value = { ...bookmark.filters }
  activeBookmarkId.value = bookmark.id
  activeGroupKey.value = bookmark.groupKey
  page.value = 1
  noticeMessage.value = `已套用当班书签「${bookmark.name}」`
}

function clearBookmark() {
  activeBookmarkId.value = null
}

function removeBookmark(id: number) {
  deleteShiftBookmark(id)
  bookmarks.value = listShiftBookmarks()
  if (activeBookmarkId.value === id) {
    activeBookmarkId.value = null
  }
}

// 旧查询参数保持可读：字段名直接用中文列名，另带 dimension/group/page/bookmark。
function readQuery() {
  const query = route.query
  if (
    typeof query.dimension === 'string' &&
    (Object.keys(TRENCH_DIMENSION_LABEL) as string[]).includes(query.dimension)
  ) {
    dimension.value = query.dimension as TrenchGroupDimension
  }
  for (const field of filterFields) {
    if (typeof query[field] === 'string') {
      filters[field] = query[field] as string
    }
  }
  committedFilters.value = { ...filters }
  if (typeof query.group === 'string') {
    activeGroupKey.value = query.group
  }
  if (typeof query.bookmark === 'string') {
    const id = Number(query.bookmark)
    if (bookmarks.value.some((item) => item.id === id)) {
      activeBookmarkId.value = id
    }
  }
  if (typeof query.page === 'string') {
    const target = Number(query.page)
    if (Number.isFinite(target) && target > 0) {
      page.value = Math.floor(target)
    }
  }
}

function syncQuery() {
  const query: Record<string, string> = {}
  if (dimension.value !== 'status') {
    query.dimension = dimension.value
  }
  if (activeBookmarkId.value !== null) {
    query.bookmark = String(activeBookmarkId.value)
  }
  for (const field of filterFields) {
    const value = filters[field]?.trim()
    if (value) {
      query[field] = value
    }
  }
  if (activeGroupKey.value) {
    query.group = activeGroupKey.value
  }
  if (page.value > 1) {
    query.page = String(page.value)
  }
  router.replace({ name: 'trench', query })
}

// 命中范围变化后，当前分组若已不存在就退回分段导航。
watch(groups, (list) => {
  if (activeGroupKey.value && !list.some((group) => group.key === activeGroupKey.value)) {
    activeGroupKey.value = ''
    page.value = 1
    detailRow.value = null
    noticeMessage.value = '当前分组已不在命中范围内，已返回分段导航'
  }
})

watch([activeGroupKey, page, drillFilters], reload)
watch(
  [dimension, activeGroupKey, page, activeBookmarkId, filters],
  syncQuery,
  { deep: true },
)

onMounted(() => {
  readQuery()
  if (activeGroupKey.value && !groups.value.some((group) => group.key === activeGroupKey.value)) {
    activeGroupKey.value = ''
    page.value = 1
    noticeMessage.value = '链接中的分组已不存在，已返回分段导航'
  }
  reload()
})
</script>
