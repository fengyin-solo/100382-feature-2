/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
  /** 总页数：页码超出时按该值回退到可操作页。 */
  totalPages: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

/** 动作执行上下文：携带当班人允许操作的发掘区，用于拦截越权修改。 */
export type ActionContext = {
  permittedAreas?: string[]
}

export type ListOptions = {
  page?: number
  size?: number
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 探方分段导航维度：按探方编号、发掘区或状态切分命中分组。 */
export type TrenchGroupDimension = 'code' | 'area' | 'status'

export type TrenchGroup = {
  dimension: TrenchGroupDimension
  key: string
  label: string
  rows: EntryRow[]
  count: number
}

/** 当班检索书签：保存当前分组口径，冲突字段以书签为准。 */
export type ShiftBookmark = {
  id: number
  name: string
  shift: string
  dimension: TrenchGroupDimension
  groupKey: string
  filters: Record<string, string>
  createdAt: string
}

/** 停用探方后挂到地层待补录台账上的核查事项。 */
export type StratumCheck = {
  id: number
  trenchCode: string
  area: string
  stratumCode: string
  reason: string
  createdAt: string
  resolved: boolean
}
