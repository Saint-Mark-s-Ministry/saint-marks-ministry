'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  createSundaySchoolRosterCsvTemplate,
  parseSundaySchoolRosterCsv,
  type ParsedSundaySchoolRosterCsv,
} from '@/lib/sunday-school-roster-csv'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_IMPORT_ROWS = 250

interface ImportResult {
  importId: string
  totalRows: number
  createdRows: number
  matchedRows: number
  skippedRows: number
  failedRows: number
  rows: Array<{
    rowNumber: number
    outcome: 'CREATED' | 'MATCHED' | 'SKIPPED' | 'FAILED'
    message: string | null
  }>
}

interface ImportHistoryItem {
  id: string
  fileName: string | null
  totalRows: number
  createdRows: number
  matchedRows: number
  skippedRows: number
  failedRows: number
  createdAt: string
  completedAt: string | null
  rolledBackAt: string | null
  removedRows: number
  protectedRows: number
}

export function SundaySchoolRosterImport({
  classId,
  className,
  onSuccess,
}: {
  classId: string
  className: string
  onSuccess: () => void | Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [parsed, setParsed] = useState<ParsedSundaySchoolRosterCsv | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [history, setHistory] = useState<ImportHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    if (!classId) return
    setHistoryLoading(true)
    try {
      const response = await fetch(`/api/sunday-school/roster-imports?classId=${encodeURIComponent(classId)}`)
      if (!response.ok) return
      setHistory(await response.json() as ImportHistoryItem[])
    } finally {
      setHistoryLoading(false)
    }
  }, [classId])

  useEffect(() => {
    if (open) void loadHistory()
  }, [open, loadHistory])

  const reset = () => {
    setFileName('')
    setIdempotencyKey('')
    setParsed(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (importing) return
    setOpen(nextOpen)
    if (!nextOpen) reset()
  }

  const handleFile = async (file: File | undefined) => {
    setResult(null)
    if (!file) {
      reset()
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Choose a CSV file')
      reset()
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('CSV files must be 1 MB or smaller')
      reset()
      return
    }

    const nextParsed = parseSundaySchoolRosterCsv(await file.text())
    if (nextParsed.rows.length > MAX_IMPORT_ROWS) {
      nextParsed.errors.push({
        rowNumber: 1,
        message: `Import up to ${MAX_IMPORT_ROWS} students at a time`,
      })
    }
    setFileName(file.name)
    setParsed(nextParsed)
    setIdempotencyKey(crypto.randomUUID())
  }

  const downloadTemplate = () => {
    const blob = new Blob([createSundaySchoolRosterCsvTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'sunday-school-roster-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0 || parsed.errors.length > 0) return
    setImporting(true)
    try {
      const response = await fetch('/api/sunday-school/roster-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          fileName,
          idempotencyKey,
          rows: parsed.rows,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to import the roster')

      setResult(body as ImportResult)
      await Promise.all([onSuccess(), loadHistory()])
      toast.success('Roster imported', {
        description: `${body.createdRows} added · ${body.matchedRows} already on file`,
      })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to import the roster')
    } finally {
      setImporting(false)
    }
  }

  const handleUndo = async (rosterImport: ImportHistoryItem) => {
    setUndoingId(rosterImport.id)
    try {
      const response = await fetch(`/api/sunday-school/roster-imports/${rosterImport.id}`, {
        method: 'DELETE',
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to undo the import')

      await Promise.all([onSuccess(), loadHistory()])
      if (body.protectedRows > 0) {
        toast.warning(`${body.removedRows} imported students removed`, {
          description: `${body.protectedRows} kept because they now have activity or account links.`,
        })
      } else {
        toast.success('CSV import undone', {
          description: `${body.removedRows} imported students removed.`,
        })
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to undo the import')
    } finally {
      setUndoingId(null)
    }
  }

  const attentionResults = result?.rows.filter(
    row => row.outcome === 'FAILED' || row.outcome === 'SKIPPED'
  ) ?? []

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" />
        Upload roster CSV
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload class roster</DialogTitle>
            <DialogDescription>
              Add children to {className} from a CSV. Existing children are matched instead of duplicated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-lg border bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">CSV format</p>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    First and last name are required. Gender, birth date, guardian contact, and notes are optional.
                    Birth dates help safely match an existing child.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="mr-1 h-4 w-4" />
                  Download template
                </Button>
              </div>
            </div>

            {!result && (
              <div className="space-y-2">
                <label htmlFor="roster-csv" className="text-sm font-medium">Roster file</label>
                <Input
                  ref={fileInputRef}
                  id="roster-csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={event => handleFile(event.target.files?.[0])}
                  disabled={importing}
                />
                <p className="text-xs text-gray-500">Maximum 250 students and 1 MB per import.</p>
              </div>
            )}

            {parsed && !result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-700" />
                    <div>
                      <p className="text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-gray-500">{parsed.rows.length} student rows found</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={reset}>Choose another</Button>
                </div>

                {parsed.errors.length > 0 ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4" />
                      Fix these rows before importing
                    </div>
                    <ul className="space-y-1">
                      {parsed.errors.slice(0, 12).map((error, index) => (
                        <li key={`${error.rowNumber}-${index}`}>Row {error.rowNumber}: {error.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border dark:border-gray-700">
                    <div className="grid grid-cols-[4rem_1fr_1fr] bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-gray-900">
                      <span>Row</span><span>Student</span><span>Guardian</span>
                    </div>
                    {parsed.rows.slice(0, 10).map(row => (
                      <div key={row.rowNumber} className="grid grid-cols-[4rem_1fr_1fr] gap-2 border-t px-3 py-2 text-sm dark:border-gray-700">
                        <span className="text-gray-500">{row.rowNumber}</span>
                        <span>{row.firstName} {row.lastName}</span>
                        <span className="truncate text-gray-500">{row.guardianName || row.guardianEmail || '—'}</span>
                      </div>
                    ))}
                    {parsed.rows.length > 10 && (
                      <p className="border-t px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
                        And {parsed.rows.length - 10} more…
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <div className="flex items-center gap-2 font-medium text-green-800 dark:text-green-200">
                    <CheckCircle2 className="h-5 w-5" />
                    Import complete
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><strong className="block text-lg">{result.createdRows}</strong>Added</div>
                    <div><strong className="block text-lg">{result.matchedRows}</strong>Matched</div>
                    <div><strong className="block text-lg">{result.skippedRows}</strong>Skipped</div>
                    <div><strong className="block text-lg">{result.failedRows}</strong>Needs attention</div>
                  </div>
                </div>
                {attentionResults.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="mb-2 font-medium">Rows that were not imported</p>
                    <ul className="space-y-1">
                      {attentionResults.map(row => (
                        <li key={row.rowNumber}>Row {row.rowNumber}: {row.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 border-t pt-5 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium">Recent CSV imports</p>
                <p className="text-xs text-gray-500">
                  Undo removes only students created by that upload. Students who were already on file are never deleted.
                </p>
              </div>

              {historyLoading && history.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading imports…
                </div>
              ) : history.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-gray-500 dark:border-gray-700">
                  No recent CSV imports for this class.
                </p>
              ) : (
                <div className="divide-y overflow-hidden rounded-lg border dark:divide-gray-700 dark:border-gray-700">
                  {history.map(rosterImport => {
                    const remainingCreated = Math.max(0, rosterImport.createdRows - rosterImport.removedRows)
                    const canUndo = !rosterImport.rolledBackAt && remainingCreated > 0
                    return (
                      <div key={rosterImport.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {rosterImport.fileName || 'Roster CSV'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(rosterImport.createdAt).toLocaleString()} · {rosterImport.createdRows} added · {rosterImport.matchedRows} matched
                          </p>
                          {rosterImport.rolledBackAt ? (
                            <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                              Undone · {rosterImport.removedRows} students removed
                            </p>
                          ) : rosterImport.removedRows > 0 ? (
                            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                              {rosterImport.removedRows} removed · {remainingCreated} protected or remaining
                            </p>
                          ) : null}
                        </div>

                        {canUndo && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={undoingId !== null}
                                className="shrink-0 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                {undoingId === rosterImport.id ? (
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-1 h-4 w-4" />
                                )}
                                Undo import
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Undo this CSV import?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove up to {remainingCreated} students created by {rosterImport.fileName || 'this CSV'}.
                                  Existing matched students will stay on the roster. Anyone with attendance, family links,
                                  an account, or later activity will also be kept for safety.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => void handleUndo(rosterImport)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Remove imported students
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
              {result ? 'Done' : 'Cancel'}
            </Button>
            {!result && (
              <Button
                onClick={handleImport}
                disabled={importing || !parsed || parsed.rows.length === 0 || parsed.errors.length > 0}
              >
                {importing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {importing ? 'Importing…' : `Import ${parsed?.rows.length ?? 0} students`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
