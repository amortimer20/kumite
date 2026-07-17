import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BusinessHours } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const DAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SettingsPanel() {
  const [hours, setHours] = useState<BusinessHours[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    api.businessHours.list().then(setHours)
  }, [])

  async function handleChange(dayOfWeek: number, patch: Partial<BusinessHours>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)))
    const updated = await api.businessHours.update(dayOfWeek, patch)
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? updated : h)))
  }

  async function handleBackup() {
    setBackupStatus(null)
    const result = await api.backup.create()
    if (!result.canceled) {
      setBackupStatus(`Backup saved to ${result.path}`)
    }
  }

  async function handleRestore() {
    const confirmed = window.confirm(
      'Restoring will replace all current data with the contents of the backup file, and the app will restart. This cannot be undone. Continue?',
    )
    if (!confirmed) return

    setBackupStatus(null)
    setRestoring(true)
    const result = await api.backup.restore()
    if (result.canceled) {
      setRestoring(false)
    }
    // Otherwise the app is relaunching now; leave the UI in its "restoring" state.
  }

  return (
    <div className="panel">
      <h2 className="mb-3 text-lg font-semibold">Business Hours</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Used on the Schedule tab to show open slots between lessons for each day.
      </p>
      <div className="flex flex-col gap-3">
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-4 border-b border-border pb-3 last:border-0">
            <span className="w-28 shrink-0 font-medium">{DAY_LABEL[h.dayOfWeek]}</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={!h.isClosed}
                onCheckedChange={(checked) => handleChange(h.dayOfWeek, { isClosed: !checked })}
              />
              <Label className="text-muted-foreground">{h.isClosed ? 'Closed' : 'Open'}</Label>
            </div>
            {!h.isClosed && (
              <>
                <Input
                  type="time"
                  className="w-auto"
                  value={h.openTime}
                  onChange={(e) => handleChange(h.dayOfWeek, { openTime: e.target.value })}
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  className="w-auto"
                  value={h.closeTime}
                  onChange={(e) => handleChange(h.dayOfWeek, { closeTime: e.target.value })}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Backup & Restore</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Export a backup file to keep a copy of your data — for example in a synced folder like
        OneDrive or Dropbox. Restoring loads a backup file back in, replacing all current data.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleBackup} disabled={restoring}>
          Export Backup
        </Button>
        <Button variant="outline" onClick={handleRestore} disabled={restoring}>
          Restore from Backup
        </Button>
      </div>
      {backupStatus && <p className="mt-3 text-sm text-muted-foreground">{backupStatus}</p>}
      {restoring && <p className="mt-3 text-sm text-muted-foreground">Restoring backup, the app will restart…</p>}
    </div>
  )
}
