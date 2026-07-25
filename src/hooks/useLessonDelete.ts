import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import type { Lesson } from '../../shared/types'

// Deleting a one-off lesson happens immediately (routine, low-stakes,
// frequent — matches how calendar apps treat single events). A recurring
// lesson opens a modal instead, since "delete" is ambiguous there.
export function useLessonDelete(onDeleted: () => void | Promise<void>) {
  const [deleteModalLesson, setDeleteModalLesson] = useState<Lesson | null>(null)

  async function handleDelete(id: string) {
    await api.lessons.delete(id)
    toast.success('Lesson deleted.')
    await onDeleted()
  }

  function handleDeleteClick(lesson: Lesson) {
    if (lesson.recurringSeriesId) {
      setDeleteModalLesson(lesson)
    } else {
      handleDelete(lesson.id)
    }
  }

  async function handleDeleteJustThisLesson() {
    if (!deleteModalLesson) return
    await handleDelete(deleteModalLesson.id)
    setDeleteModalLesson(null)
  }

  async function handleDeleteThisAndFutureLessons() {
    if (!deleteModalLesson?.recurringSeriesId) return
    await api.recurringSeries.deleteFrom(deleteModalLesson.recurringSeriesId, deleteModalLesson.startTime)
    toast.success('Deleted this and all future lessons.')
    setDeleteModalLesson(null)
    await onDeleted()
  }

  return {
    deleteModalLesson,
    setDeleteModalLesson,
    handleDeleteClick,
    handleDeleteJustThisLesson,
    handleDeleteThisAndFutureLessons,
  }
}
