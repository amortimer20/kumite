import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { getErrorMessage } from '@/lib/errors'
import { lessonHasHappened } from '@/lib/lessonStatus'
import type { Lesson } from '../../shared/types'

function describeLesson(lesson: Lesson) {
  return new Date(lesson.startTime).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Deleting an upcoming one-off lesson happens immediately (routine, low-stakes,
// frequent — matches how calendar apps treat single events). Two cases are
// deliberately slower: a recurring lesson opens a modal, since "delete" is
// ambiguous there, and a lesson that has already taken place asks first,
// because that record is attendance history rather than a plan. Scrolling the
// schedule back to check who attended and mis-clicking Delete used to destroy
// that instantly, with no dialog and no undo.
export function useLessonDelete(onDeleted: () => void | Promise<void>) {
  const [deleteModalLesson, setDeleteModalLesson] = useState<Lesson | null>(null)

  async function handleDelete(id: string) {
    try {
      await api.lessons.delete(id)
      toast.success('Lesson deleted.')
      await onDeleted()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  function handleDeleteClick(lesson: Lesson) {
    if (lesson.recurringSeriesId) {
      setDeleteModalLesson(lesson)
      return
    }
    if (lessonHasHappened(lesson)) {
      const confirmed = window.confirm(
        `Delete the lesson on ${describeLesson(lesson)}? It has already taken place, so its record — including attendance — will be lost. This cannot be undone.`,
      )
      if (!confirmed) return
    }
    handleDelete(lesson.id)
  }

  async function handleDeleteJustThisLesson() {
    if (!deleteModalLesson) return
    await handleDelete(deleteModalLesson.id)
    setDeleteModalLesson(null)
  }

  async function handleDeleteThisAndFutureLessons() {
    if (!deleteModalLesson?.recurringSeriesId) return
    try {
      await api.recurringSeries.deleteFrom(deleteModalLesson.recurringSeriesId, deleteModalLesson.startTime)
      toast.success('Deleted this and all future lessons.')
      setDeleteModalLesson(null)
      await onDeleted()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return {
    deleteModalLesson,
    setDeleteModalLesson,
    handleDeleteClick,
    handleDeleteJustThisLesson,
    handleDeleteThisAndFutureLessons,
  }
}
