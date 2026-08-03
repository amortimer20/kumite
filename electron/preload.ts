import { ipcRenderer, contextBridge } from 'electron'
import type {
  Api,
  AppSettingsInput,
  BusinessHoursInput,
  CertificateInput,
  CertificateType,
  FamilyMemberInput,
  InstructorInput,
  LessonInput,
  LessonListFilter,
  LessonStatus,
  MembershipPaymentInput,
  MembershipPlanInput,
  MembershipUsageAdjustmentInput,
  PosItemInput,
  PosSaleInput,
  RecurringSeriesInput,
  ReportDateRangeInput,
  ReportExportInput,
  StudentInput,
} from '../shared/types.ts'

const api: Api = {
  students: {
    list: () => ipcRenderer.invoke('students:list'),
    create: (input: StudentInput) => ipcRenderer.invoke('students:create', input),
    update: (id: string, input: Partial<StudentInput>) => ipcRenderer.invoke('students:update', id, input),
    delete: (id: string, options?: { force?: boolean }) => ipcRenderer.invoke('students:delete', id, options),
  },
  instructors: {
    list: () => ipcRenderer.invoke('instructors:list'),
    create: (input: InstructorInput) => ipcRenderer.invoke('instructors:create', input),
    update: (id: string, input: Partial<InstructorInput>) => ipcRenderer.invoke('instructors:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('instructors:delete', id),
  },
  lessons: {
    list: (filter?: LessonListFilter) => ipcRenderer.invoke('lessons:list', filter),
    create: (input: LessonInput) => ipcRenderer.invoke('lessons:create', input),
    update: (id: string, input: Partial<LessonInput>) => ipcRenderer.invoke('lessons:update', id, input),
    updateStatus: (id: string, status: LessonStatus) => ipcRenderer.invoke('lessons:updateStatus', id, status),
    delete: (id: string) => ipcRenderer.invoke('lessons:delete', id),
  },
  businessHours: {
    list: () => ipcRenderer.invoke('businessHours:list'),
    update: (dayOfWeek: number, input: BusinessHoursInput) => ipcRenderer.invoke('businessHours:update', dayOfWeek, input),
  },
  recurringSeries: {
    create: (input: RecurringSeriesInput) => ipcRenderer.invoke('recurringSeries:create', input),
    deleteFrom: (seriesId: string, fromDateTime: string) => ipcRenderer.invoke('recurringSeries:deleteFrom', seriesId, fromDateTime),
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    chooseDirectory: () => ipcRenderer.invoke('backup:chooseDirectory'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (input: AppSettingsInput) => ipcRenderer.invoke('settings:update', input),
  },
  familyMembers: {
    create: (studentId: string, input: FamilyMemberInput) => ipcRenderer.invoke('familyMembers:create', studentId, input),
    update: (id: string, input: Partial<FamilyMemberInput>) => ipcRenderer.invoke('familyMembers:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('familyMembers:delete', id),
  },
  certificates: {
    listAvailableRanks: (type: CertificateType) => ipcRenderer.invoke('certificates:listAvailableRanks', type),
    print: (input: CertificateInput) => ipcRenderer.invoke('certificates:print', input),
  },
  membershipPlans: {
    list: () => ipcRenderer.invoke('membershipPlans:list'),
    create: (input: MembershipPlanInput) => ipcRenderer.invoke('membershipPlans:create', input),
    update: (id: string, input: Partial<MembershipPlanInput>) => ipcRenderer.invoke('membershipPlans:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('membershipPlans:delete', id),
  },
  studentMemberships: {
    getForStudent: (studentId: string) => ipcRenderer.invoke('studentMemberships:getForStudent', studentId),
    listActive: () => ipcRenderer.invoke('studentMemberships:listActive'),
    assign: (studentId: string, input: { planId: string; priceOverrideCents?: number | null; startDate: string }) =>
      ipcRenderer.invoke('studentMemberships:assign', studentId, input),
    update: (id: string, input: { planId?: string; priceOverrideCents?: number | null }) =>
      ipcRenderer.invoke('studentMemberships:update', id, input),
    cancel: (id: string) => ipcRenderer.invoke('studentMemberships:cancel', id),
    recordPayment: (id: string, input: MembershipPaymentInput) => ipcRenderer.invoke('studentMemberships:recordPayment', id, input),
    deletePayment: (paymentId: string) => ipcRenderer.invoke('studentMemberships:deletePayment', paymentId),
    addUsageAdjustment: (id: string, input: MembershipUsageAdjustmentInput) =>
      ipcRenderer.invoke('studentMemberships:addUsageAdjustment', id, input),
    getPaymentHistory: (studentId: string) => ipcRenderer.invoke('studentMemberships:getPaymentHistory', studentId),
  },
  posItems: {
    list: () => ipcRenderer.invoke('posItems:list'),
    create: (input: PosItemInput) => ipcRenderer.invoke('posItems:create', input),
    update: (id: string, input: Partial<PosItemInput>) => ipcRenderer.invoke('posItems:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('posItems:delete', id),
  },
  posSales: {
    list: () => ipcRenderer.invoke('posSales:list'),
    create: (input: PosSaleInput) => ipcRenderer.invoke('posSales:create', input),
    delete: (id: string) => ipcRenderer.invoke('posSales:delete', id),
  },
  reports: {
    generate: (input: ReportDateRangeInput) => ipcRenderer.invoke('reports:generate', input),
    exportCsv: (input: ReportExportInput) => ipcRenderer.invoke('reports:exportCsv', input),
  },
  appInfo: {
    get: () => ipcRenderer.invoke('appInfo:get'),
  },
}

contextBridge.exposeInMainWorld('api', api)
