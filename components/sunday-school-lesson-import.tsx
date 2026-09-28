'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import {
  createSundaySchoolLessonCsvTemplate,
  parseSundaySchoolLessonCsv,
  type ParsedSundaySchoolLessonCsv,
} from '@/lib/sunday-school-lesson-csv'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_IMPORT_ROWS = 150

interface ImportClass {
  id: string
  name: string
}

interface ImportResult {
  totalRows: number
  updatedRows: number
  createdRows: number
  assignedRows: number
  unmatchedRows: number
  warnings: Array<{ rowNumber: number; message: string }>
  className: string
}

export function SundaySchoolLessonImport({
  classes,
  initialClassId,
  onSuccess,
}: {
  classes: ImportClass[]
  initialClassId?: string
  onSuccess: () => void | Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [classId, setClassId] = useState(initialClassId || classes[0]?.id || '')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedSundaySchoolLessonCsv | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    const preferred = initialClassId && classes.some(item => item.id === initialClassId)
      ? initialClassId
      : classes[0]?.id || ''
    setClassId(preferred)
  }, [classes, initialClassId])

  const resetFile = () => {
    setFileName('')
    setParsed(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (importing) return
    setOpen(nextOpen)
    if (!nextOpen) resetFile()
  }

  const handleFile = async (file: File | undefined) => {
    setResult(null)
    if (!file) {
      resetFile()
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Choose a CSV file')
      resetFile()
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('CSV files must be 1 MB or smaller')
      resetFile()
      return
    }

    const nextParsed = parseSundaySchoolLessonCsv(await file.text())
    if (nextParsed.rows.length > MAX_IMPORT_ROWS) {
      nextParsed.errors.push({
        rowNumber: 1,
        message: `Import up to ${MAX_IMPORT_ROWS} lessons at a time`,
      })
    }
    setFileName(file.name)
    setParsed(nextParsed)
  }

  const downloadTemplate = () => {
    const blob = new Blob([createSundaySchoolLessonCsvTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'sunday-school-lesson-assignments-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!classId || !parsed || parsed.rows.length === 0 || parsed.errors.length > 0) return
    setImporting(true)
    try {
      const response = await fetch('/api/sunday-school/lesson-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, rows: parsed.rows }),
      })
      const body = await response.json()
      if (!response.ok) {
        const details = Array.isArray(body.errors)
          ? body.errors.slice(0, 3).map((error: { rowNumber: number; message: string }) => `Row ${error.rowNumber}: ${error.message}`).join(' · ')
          : null
        throw new Error(details || body.error || 'Failed to import lessons')
      }

      setResult(body as ImportResult)
      await onSuccess()
      toast.success('Lessons imported', {
        description: `${body.assignedRows} servants assigned · ${body.unmatchedRows} need review`,
      })
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to import lessons')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={classes.length === 0}>
        <Upload className="mr-1 h-4 w-4" />
        Upload schedule CSV
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload lesson assignments by grade</DialogTitle>
            <DialogDescription>
              Import the dates and assigned servants for one class or grade. Servants can add the lesson title and links in the portal later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="lesson-import-class">Class or grade</Label>
              <select
                id="lesson-import-class"
                value={classId}
                onChange={event => setClassId(event.target.value)}
                disabled={importing || Boolean(result)}
                className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>

            <div className="rounded-lg border bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-xl">
                  <p className="font-medium">CSV format</p>
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    Date and servant name are the normal columns. Email is optional; when it is missing,
                    the portal matches the servant by name. Existing lesson titles and links are preserved.
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
                <Label htmlFor="lesson-csv">Assignment schedule</Label>
                <Input
                  ref={fileInputRef}
                  id="lesson-csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={event => void handleFile(event.target.files?.[0])}
                  disabled={importing}
                />
                <p className="text-xs text-gray-500">
                  Export an existing Excel or Google Sheet as CSV. Maximum 150 lessons and 1 MB.
                </p>
              </div>
            )}

            {parsed && !result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-700" />
                    <div>
                      <p className="text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-gray-500">{parsed.rows.length} assignment rows found</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={resetFile}>Choose another</Button>
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
                    <div className="grid grid-cols-[7rem_1fr_1fr] bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 dark:bg-gray-900">
                      <span>Date</span><span>Servant</span><span>Email</span>
                    </div>
                    {parsed.rows.slice(0, 10).map(row => (
                      <div key={row.rowNumber} className="grid grid-cols-[7rem_1fr_1fr] gap-2 border-t px-3 py-2 text-sm dark:border-gray-700">
                        <span>{row.lessonDate}</span>
                        <span className="truncate">{row.ownerName || '—'}</span>
                        <span className="truncate text-gray-500">{row.ownerEmail || 'Matched by name'}</span>
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
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                <div className="flex items-center gap-2 font-medium text-green-800 dark:text-green-200">
                  <CheckCircle2 className="h-5 w-5" />
                  {result.className} assignment schedule imported
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><strong className="block text-lg">{result.totalRows}</strong>Total</div>
                  <div><strong className="block text-lg">{result.updatedRows}</strong>Updated</div>
                  <div><strong className="block text-lg">{result.assignedRows}</strong>Assigned</div>
                  <div><strong className="block text-lg">{result.unmatchedRows}</strong>Needs review</div>
                </div>
                {result.warnings.length > 0 && (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="mb-2 font-medium">Assign these rows manually in the portal</p>
                    <ul className="space-y-1">
                      {result.warnings.map(warning => (
                        <li key={`${warning.rowNumber}-${warning.message}`}>
                          Row {warning.rowNumber}: {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
              {result ? 'Done' : 'Cancel'}
            </Button>
            {!result && (
              <Button
                onClick={handleImport}
                disabled={importing || !classId || !parsed || parsed.rows.length === 0 || parsed.errors.length > 0}
              >
                {importing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {importing ? 'Importing…' : `Import ${parsed?.rows.length ?? 0} assignments`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
