import { useEffect, useState } from 'react'
import { api } from '../api'
import type { BusinessHours } from '../../shared/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const DAY_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SettingsPanel() {
  const [hours, setHours] = useState<BusinessHours[]>([])

  useEffect(() => {
    api.businessHours.list().then(setHours)
  }, [])

  async function handleChange(dayOfWeek: number, patch: Partial<BusinessHours>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)))
    const updated = await api.businessHours.update(dayOfWeek, patch)
    setHours((prev) => prev.map((h) => (h.dayOfWeek === dayOfWeek ? updated : h)))
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
    </div>
  )
}
