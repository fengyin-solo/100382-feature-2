import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '田野考古发掘数字化管理系统',
    // 本班可操作的发掘区：探方动作按所属发掘区做越权拦截。
    permittedAreas: ['甲区', '乙区'],
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setPermittedAreas(areas: string[]) {
      this.permittedAreas = areas
    },
  },
})
