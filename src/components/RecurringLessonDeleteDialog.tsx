import { Trash2 } from 'lucide-react'
import type { Lesson } from '../../shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function RecurringLessonDeleteDialog({
  lesson,
  onOpenChange,
  onDeleteJustThis,
  onDeleteThisAndFuture,
}: {
  lesson: Lesson | null
  onOpenChange: (open: boolean) => void
  onDeleteJustThis: () => void
  onDeleteThisAndFuture: () => void
}) {
  return (
    <Dialog open={lesson !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete recurring lesson</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This lesson is part of a weekly series. What would you like to delete?
        </p>
        <DialogFooter className="sm:flex-col sm:gap-2">
          <Button variant="destructive" onClick={onDeleteJustThis}><Trash2 />Just this lesson</Button>
          <Button variant="destructive" onClick={onDeleteThisAndFuture}><Trash2 />This and all future lessons</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
