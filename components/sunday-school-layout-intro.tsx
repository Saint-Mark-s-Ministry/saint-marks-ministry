'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

function getDismissKey(userId: string) {
  return `sunday-school-layout-intro-dismissed:${userId}`
}

const PLACES = [
  { name: 'Home', what: 'this week’s lesson, attendance and who needs you' },
  { name: 'Attendance', what: 'children, and servants for coordinators' },
  { name: 'Children', what: 'the roster; tap a name for family and history' },
  { name: 'Care', what: 'follow up, visits & calls, birthdays' },
  { name: 'Lessons', what: 'the schedule, and homework for Elementary' },
]

/**
 * A one-time note on Home after the Sunday School layout changed: where things
 * live now, and that one class choice drives every page. Dismissed per person,
 * on this device; View as never dismisses it for the person being viewed.
 */
export function SundaySchoolLayoutIntro() {
  const { data: session, status } = useSession()
  const [dismissed, setDismissed] = useState(true) // hidden until storage is read, to avoid a flash
  const userId = session?.user?.id
  const isViewingAs = Boolean(session?.impersonating)

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return
    try {
      setDismissed(localStorage.getItem(getDismissKey(userId)) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [status, userId])

  if (dismissed || !userId) return null

  const dismiss = () => {
    if (!isViewingAs) {
      try {
        localStorage.setItem(getDismissKey(userId), 'true')
      } catch {
        // Storage can be unavailable in privacy-restricted browsers; hide it for now.
      }
    }
    setDismissed(true)
  }

  return (
    <section
      aria-labelledby="sunday-school-layout-intro"
      className="relative rounded-lg border border-gold/30 bg-gold-tint px-4 py-3.5 text-ink print:hidden"
    >
      <div className="flex items-start gap-3 pr-8">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.75} aria-hidden />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id="sunday-school-layout-intro" className="text-[14px] font-semibold">
            Sunday School has a simpler layout
          </h2>
          <p className="text-[13px] text-ink-2">
            Everything is still here, in five places. Your class appears at the top of the screen on a phone and in the sidebar on a computer. If you have more than one class, choose it under <b>Viewing class</b> and the class pages follow your choice.
          </p>
          <ul className="grid gap-x-6 gap-y-1 text-[13px] text-ink-2 sm:grid-cols-2">
            {PLACES.map(place => (
              <li key={place.name}>
                <span className="font-medium text-ink">{place.name}</span> · {place.what}
              </li>
            ))}
          </ul>
          <div>
            <Button size="sm" variant="outline" onClick={dismiss}>
              Got it
            </Button>
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </Button>
    </section>
  )
}
