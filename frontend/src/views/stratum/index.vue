<template>
  <section class="page" data-module="stratum">
    <header class="page-head">
      <div>
        <h2>地层记录管理</h2>
        <p class="page-desc">维护地层，围绕地层编号、所属探方、层位序号、土质描述做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记地层</button>
        <button class="btn" type="button" @click="exportRows">导出地层记录清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <section class="review-ledger">
      <header class="review-head">
        <h3>地层待补录台账核查事项</h3>
        <span class="legend-item">待补录 {{ pendingRows.length }} 条</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>地层编号</th>
            <th>所属探方</th>
            <th>层位序号</th>
            <th>当前状态</th>
            <th>核查事项</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pendingRows" :key="String(row.id)">
            <td>{{ row['地层编号'] }}</td>
            <td>{{ row['所属探方'] }}</td>
            <td>{{ row['层位序号'] }}</td>
            <td>{{ row.status }}</td>
            <td>{{ row['核查事项'] || '停用探方触发待补录，请核查土质土色、包含物与剖面图' }}</td>
          </tr>
          <tr v-if="!pendingRows.length">
            <td colspan="5" class="empty-state">暂无待补录地层，停用关联探方后此处会自动新增核查事项</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>核查事项</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row['核查事项'] || '—' }}</td>
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
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无地层记录数据，可先登记地层</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条地层记录记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('stratum')
const columns = ["地层编号", "所属探方", "层位序号", "土质描述", "土色描述", "包含物特征", "记录人", "记录状态"]
const actions = ["提交记录", "完成校核", "退回补录"]
const statuses = ["已划分", "已记录", "已校核", "需补录"]
const stats = [{"label": "地层总数", "value": 0}, {"label": "已校核层数", "value": 0}, {"label": "待记录层数", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const tick = ref(0)
// 台账走同一条取数路径：状态 = 需补录 的地层即待核查事项来源。
const pendingRows = computed(() => {
  void tick.value
  return listEntries(meta.key, { 状态: '需补录' }).items
})
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '地层登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    tick.value += 1
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '地层记录列表读取失败'
  }
}

onMounted(reload)
</script>
