'use client'

import { Network, Phone } from 'lucide-react'
import { ContactLink } from '@/components/contact-link'
import { Initials } from '@/components/ds/person'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const TILE_CLASS_NAME =
  'mx-0 flex w-full gap-3 rounded-lg border border-line px-3 py-3 text-sm text-ink hover:no-underline [&>svg]:size-4 [&>svg]:text-ink-3 [&>svg]:opacity-100'

interface ServantContact {
  name: string
  email: string
  phone: string | null
  profileImageUrl: string | null
}

export function ServantContactDialog({
  servant,
  onClose,
  onViewOrganization,
}: {
  servant: ServantContact
  onClose: () => void
  onViewOrganization: () => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex min-w-0 items-center gap-3 pr-8">
            <Initials name={servant.name} imageUrl={servant.profileImageUrl} size={44} />
            <div className="min-w-0">
              <DialogTitle className="truncate">{servant.name}</DialogTitle>
              <DialogDescription>Sunday School servant contact</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <ContactLink kind="email" value={servant.email} name={servant.name} label="servant's email" className={TILE_CLASS_NAME} />
          {servant.phone ? (
            <ContactLink kind="phone" value={servant.phone} name={servant.name} label="servant's phone number" className={TILE_CLASS_NAME} />
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-3">
              <Phone className="size-4 shrink-0" />
              No phone number on file
            </div>
          )}
        </div>

        <Button type="button" variant="outline" onClick={onViewOrganization}>
          <Network />
          View organization
        </Button>
      </DialogContent>
    </Dialog>
  )
}
