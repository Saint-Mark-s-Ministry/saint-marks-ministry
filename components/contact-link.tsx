'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Copy, Mail, MapPin, MessageCircle, Phone, Video } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  detectContactPlatform,
  getContactActions,
  isMobileContactPlatform,
  type ContactAction,
  type ContactActionId,
  type ContactKind,
  type ContactPlatform,
} from '@/lib/contact-links'
import { cn } from '@/lib/utils'

const subscribe = () => () => {}
const getPlatform = (): ContactPlatform =>
  detectContactPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  })

/** Null during server render; the platform is only knowable in the browser. */
export function useContactPlatform() {
  return useSyncExternalStore<ContactPlatform | null>(subscribe, getPlatform, () => null)
}

const ACTION_ICONS: Record<ContactActionId, typeof Phone> = {
  call: Phone,
  text: MessageCircle,
  facetime: Video,
  'facetime-audio': Phone,
  email: Mail,
  directions: MapPin,
  copy: Copy,
}

const KIND_NOUN: Record<ContactKind, string> = {
  phone: 'phone number',
  email: 'email',
  address: 'address',
}

/**
 * A phone number, email, or address that opens the right app when tapped.
 *
 * On iPhone/iPad it raises an iOS-style action sheet (Call · Message · FaceTime ·
 * Copy, with a separate Cancel), on Android the same sheet with "Text", and on
 * desktops a small menu beside the value (Macs also get FaceTime and "Call with
 * iPhone"). The value stays readable inline, so it still works as plain text.
 */
export function ContactLink({
  kind,
  value,
  name,
  label,
  className,
  children,
}: {
  kind: ContactKind
  value: string
  /** Who this reaches, shown as the sheet title ("Mariam Girgis"). */
  name?: string | null
  /** Accessible description, e.g. "mother's phone number". */
  label?: string
  className?: string
  children?: ReactNode
}) {
  const platform = useContactPlatform()
  const [sheetOpen, setSheetOpen] = useState(false)
  const effectivePlatform = platform ?? 'desktop'
  const actions = getContactActions(kind, value, effectivePlatform)
  const description = label ?? KIND_NOUN[kind]
  const triggerLabel = `Contact options for ${description}${name ? ` (${name})` : ''}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`Copied ${description}`)
    } catch {
      toast.error(`Could not copy ${description}`)
    }
  }

  const triggerClassName = cn(
    'group -mx-1 inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-accent-ink underline-offset-2 transition-colors hover:bg-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    kind === 'phone' && 'tabular-nums',
    className
  )
  const content = (
    <>
      <KindIcon kind={kind} />
      <span className="min-w-0 break-words">{children ?? value}</span>
    </>
  )

  if (platform && isMobileContactPlatform(platform)) {
    return (
      <>
        <button type="button" className={triggerClassName} aria-label={triggerLabel} aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          {content}
        </button>
        <ContactActionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          platform={platform}
          title={name || value}
          subtitle={name ? value : undefined}
          actions={actions}
          onCopy={copy}
        />
      </>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={triggerClassName} aria-label={triggerLabel}>
        {content}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel className="max-w-72 truncate text-xs font-normal text-ink-3">{name ? `${name} · ${value}` : value}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map(action => {
          const Icon = ACTION_ICONS[action.id]
          if (action.id === 'copy') {
            return (
              <DropdownMenuItem key={action.id} onSelect={copy}>
                <Icon />
                {action.label}
              </DropdownMenuItem>
            )
          }
          return (
            <DropdownMenuItem key={action.id} asChild>
              <a href={action.href} {...externalLinkProps(action)}>
                <Icon />
                {action.label}
              </a>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function KindIcon({ kind }: { kind: ContactKind }) {
  const Icon = kind === 'phone' ? Phone : kind === 'email' ? Mail : MapPin
  return <Icon aria-hidden className="size-3.5 shrink-0 opacity-70" />
}

/** Maps open in a new tab on desktop; app schemes (tel:, sms:, mailto:) must stay in the same tab. */
function externalLinkProps(action: ContactAction) {
  return action.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

function ContactActionSheet({
  open,
  onOpenChange,
  platform,
  title,
  subtitle,
  actions,
  onCopy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  platform: ContactPlatform
  title: string
  subtitle?: string
  actions: ContactAction[]
  onCopy: () => void
}) {
  const ios = platform === 'ios'
  const close = () => onOpenChange(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(19,18,17,0.4)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none',
            !ios && 'px-0 pb-0'
          )}
          onOpenAutoFocus={event => event.preventDefault()}
        >
          <div
            className={cn(
              'overflow-hidden bg-surface text-ink',
              ios ? 'rounded-[14px] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/90' : 'rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)]'
            )}
          >
            {!ios && <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-line" />}
            <div className={cn('px-4 py-3', ios ? 'text-center' : 'text-left')}>
              <DialogPrimitive.Title className={cn('truncate', ios ? 'text-[13px] font-semibold text-ink-2' : 'text-base font-semibold')}>
                {title}
              </DialogPrimitive.Title>
              {subtitle && <p className={cn('truncate text-ink-3', ios ? 'text-[13px]' : 'text-sm')}>{subtitle}</p>}
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {actions.map(action => {
                const Icon = ACTION_ICONS[action.id]
                const rowClassName = cn(
                  'flex w-full items-center gap-3 px-4 transition-colors active:bg-hover focus-visible:bg-hover focus-visible:outline-none',
                  ios ? 'min-h-14 justify-center text-[17px] text-accent-ink' : 'min-h-12 text-[15px]'
                )
                const body = (
                  <>
                    {!ios && <Icon aria-hidden className="size-5 text-ink-3" />}
                    {action.label}
                  </>
                )
                return (
                  <li key={action.id}>
                    {action.id === 'copy' ? (
                      <button type="button" className={rowClassName} onClick={() => { onCopy(); close() }}>
                        {body}
                      </button>
                    ) : (
                      <a href={action.href} className={rowClassName} onClick={close} {...externalLinkProps(action)}>
                        {body}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {ios && (
            <DialogPrimitive.Close className="min-h-14 w-full rounded-[14px] bg-surface text-[17px] font-semibold text-accent-ink transition-colors active:bg-hover focus-visible:outline-none">
              Cancel
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
