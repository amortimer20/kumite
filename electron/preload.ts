import { ipcRenderer, contextBridge } from 'electron'
import type {
  Api,
  BusinessHoursInput,
  InstructorInput,
  LessonInput,
  LessonListFilter,
  LessonStatus,
  StudentInput,
} from '../shared/types.ts'

const api: Api = {
  students: {
    list: () => ipcRenderer.invoke('students:list'),
    create: (input: StudentInput) => ipcRenderer.invoke('students:create', input),
    update: (id: string, input: Partial<StudentInput>) => ipcRenderer.invoke('students:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('students:delete', id),
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
}

contextBridge.exposeInMainWorld('api', api)
