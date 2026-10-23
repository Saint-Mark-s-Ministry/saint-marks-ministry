import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogCancel } from '@/components/ui/alert-dialog'

function ConditionalOwner({ alert = false, closed }: { alert?: boolean; closed: () => void }) {
  const [mounted, setMounted] = useState(true)
  if (!mounted) return <p>Owner released</p>
  const onOpenChange = (open: boolean) => { if (!open) { closed(); setMounted(false) } }
  return alert ? <AlertDialog open onOpenChange={onOpenChange}><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>Confirm change</AlertDialogTitle><AlertDialogCancel>Cancel</AlertDialogCancel></AlertDialogContent></AlertDialog>
    : <Dialog open onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined}><DialogTitle>Child profile</DialogTitle></DialogContent></Dialog>
}

afterEach(() => { document.documentElement.style.removeProperty('--modal-motion-duration'); vi.useRealTimers() })

describe('modal owners survive closing motion', () => {
  it.each([false, true])('defers conditional owner removal for dialog/confirmation (alert=%s)', alert => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--modal-motion-duration', '200ms')
    const closed = vi.fn()
    render(<ConditionalOwner alert={alert} closed={closed} />)
    fireEvent.click(screen.getByRole('button', { name: alert ? 'Cancel' : 'Close' }))
    expect(closed).not.toHaveBeenCalled()
    expect(screen.queryByText('Owner released')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(250))
    expect(closed).toHaveBeenCalledOnce()
    expect(screen.getByText('Owner released')).toBeInTheDocument()
  })
})
