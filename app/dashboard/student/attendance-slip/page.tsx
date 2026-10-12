'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Download, Printer } from 'lucide-react'

// Printable rotation form matching the ministry's Google Doc:
// https://docs.google.com/document/d/1zek9b1hcWBt9ygwvkv2Cv8fSZ8L1irlgCrCCSlYQTMc/edit
export default function AttendanceSlipPage() {
  const { session, status } = useAdminGuard(isStudent)
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && !session?.user?.isAsyncStudent) {
      router.push('/dashboard/student')
    }
  }, [status, session, router])

  if (status !== 'authenticated' || !session?.user?.isAsyncStudent) return <PageLoading />

  return (
    <div className="content-reveal flex min-w-0 flex-col print:bg-white print:p-0">
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="ghost" onClick={() => router.push('/dashboard/student')}>
            <ChevronLeft />
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/forms/servants-prep-rotations-form.pdf" download="servants-prep-rotations-form.pdf">
                <Download />
                Download PDF
              </a>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
          </div>
        </div>

        {/* The slip is paper in both themes: it gets printed and signed. */}
        <div className="mx-auto w-full max-w-[816px] bg-white p-6 text-[#1B1817] shadow-[0_8px_30px_rgba(0,0,0,0.18)] md:p-14 print:max-w-none print:p-0 print:shadow-none">
          <div className="flex flex-col gap-12 print:gap-10">
            {[0, 1].map((copy) => (
              <section key={copy} className="break-inside-avoid">
                <h1 className="mb-4 text-center text-xl font-bold">Servants Prep Rotations Form</h1>
                <p className="mb-3 flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
                  <span>Attendee Name: ____________________________</span>
                  <span>Grade Attended: ______________</span>
                </p>
                <p className="mb-3 text-xs italic">
                  *Only sign if the attendee was present at the beginning of class and attended for its entirety.
                </p>
                <table aria-label={`Rotations form ${copy + 1}`} className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="w-14 border border-black p-2 text-left">Week</th>
                      <th scope="col" className="w-28 border border-black p-2 text-left">Date</th>
                      <th scope="col" className="border border-black p-2 text-left">Servant name (Print)</th>
                      <th scope="col" className="border border-black p-2 text-left">Servant Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((week) => (
                      <tr key={week} className="h-12 break-inside-avoid">
                        <th scope="row" className="border border-black p-2 text-left font-normal">{week}</th>
                        <td className="border border-black p-2" />
                        <td className="border border-black p-2" />
                        <td className="border border-black p-2" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
