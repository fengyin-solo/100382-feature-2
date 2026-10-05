/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

// 停用动作命中后，给相邻台账模块追加一条核查事项的联动配置。
export type SideEffect = {
  module: string
  relationField: string
  checkNote: string
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
  // 模块行上标识所属发掘区的字段；配置后状态动作按操作人发掘区做越权拦截。
  areaField?: string
  // 以「停用」开头的动作命中后，对相邻台账模块执行的核查联动。
  suspendSideEffects?: SideEffect[]
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  size: number
  totalPages: number
  // 请求页码超出总页数时为 true，实际页已回收到可操作的最后一页。
  clamped?: boolean
}

export type PageResult = Paginated<EntryRow>

export type ActionResult = {
  ok: boolean
  message: string
}

// 状态动作的操作人上下文：目前用于按发掘区做越权拦截。
export type ActionOptions = {
  area?: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
