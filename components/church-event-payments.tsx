import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ds/panel'

/** Reference link only: payment creation and confirmations stay on the church site. */
export function ChurchEventPayments() {
  return (
    <Panel title="Trip & event payments">
      <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-2">
          Organizing a trip or service event? Use the church payment site to create a
          unique payment link so participants can pay the church directly. Set up
          payment confirmation emails there.
        </p>
        <Button asChild variant="outline" className="shrink-0">
          <a href="https://pray.saintmark.com/donate/create" target="_blank" rel="noopener noreferrer">
            Create a payment link
            <ExternalLink aria-hidden className="size-4" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </div>
    </Panel>
  )
}
