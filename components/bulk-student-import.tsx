'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { UserPlus, Upload, X, Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface BulkStudentImportProps {
  onSuccess: () => void
}

interface StudentRow {
  name: string
  email?: string
  phone?: string
  yearLevel?: 'YEAR_1' | 'YEAR_2'
}

export function BulkStudentImport({ onSuccess }: BulkStudentImportProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [studentText, setStudentText] = useState('')
  const [defaultPassword, setDefaultPassword] = useState('password123')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [parsedStudents, setParsedStudents] = useState<StudentRow[]>([])

  // Parse student text input
  const parseStudents = (text: string) => {
    const lines = text.trim().split('\n').filter(line => line.trim())
    const students: StudentRow[] = []

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())

      if (parts.length === 0 || !parts[0]) continue

      const student: StudentRow = {
        name: parts[0],
        email: parts[1] || undefined,
        phone: parts[2] || undefined,
        yearLevel: parts[3]?.toUpperCase() === 'YEAR_2' ? 'YEAR_2' : 'YEAR_1'
      }

      students.push(student)
    }

    setParsedStudents(students)
  }

  const handleTextChange = (text: string) => {
    setStudentText(text)
    parseStudents(text)
  }

  const handleSubmit = async () => {
    if (parsedStudents.length === 0) {
      toast.error('Please enter at least one student')
      return
    }

    if (!defaultPassword || defaultPassword.length < 6) {
      toast.error('Default password must be at least 6 characters')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/users/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: parsedStudents,
          defaultPassword
        })
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to create students')
        return
      }

      // Show success message with details
      const successMsg = `Successfully created ${data.totalCreated} student(s)`
      const errorMsg = data.totalErrors > 0 ? ` (${data.totalErrors} failed)` : ''

      toast.success(successMsg + errorMsg, {
        description: data.errors.length > 0
          ? `Errors: ${data.errors.map((e: { name: string; error: string }) => `${e.name}: ${e.error}`).join(', ')}`
          : undefined
      })

      // Reset form
      setStudentText('')
      setParsedStudents([])
      setIsOpen(false)
      onSuccess()

    } catch (error) {
      console.error('Failed to create students:', error)
      toast.error('Failed to create students')
    } finally {
      setIsSubmitting(false)
    }
  }

  const removeStudent = (index: number) => {
    const newText = studentText.split('\n').filter((_, i) => i !== index).join('\n')
    setStudentText(newText)
    parseStudents(newText)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
      >
        <Upload className="h-4 w-4" />
        Bulk Add Students
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Bulk Add Students
            </DialogTitle>
            <DialogDescription>
              Add multiple students at once. Enter one student per line.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Instructions */}
            <div className="bg-maroon-50 border border-maroon-200 rounded-lg p-4">
              <h4 className="font-semibold mb-2 text-sm">Format Instructions:</h4>
              <p className="text-sm text-gray-700 mb-2">
                Enter one student per line in this format:
              </p>
              <code className="block bg-white p-2 rounded text-xs mb-2">
                Name, Email (optional), Phone (optional), Year Level (optional)
              </code>
              <p className="text-xs text-gray-600">
                <strong>Examples:</strong><br/>
                John Doe<br/>
                Jane Smith, jane@email.com<br/>
                Mark Johnson, mark@email.com, 555-1234<br/>
                Sarah Williams, sarah@email.com, 555-5678, YEAR_2
              </p>
              <p className="text-xs text-gray-600 mt-2">
                <strong>Notes:</strong><br/>
                • If email is not provided, a temporary email will be generated<br/>
                • Default year level is YEAR_1 if not specified<br/>
                • All students will receive the same default password
              </p>
            </div>

            {/* Default Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Default Password (for all students)</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                  placeholder="Enter default password"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                All students will use this password initially. They should change it after first login.
              </p>
            </div>

            {/* Student Input */}
            <div className="space-y-2">
              <Label htmlFor="students">Student List</Label>
              <Textarea
                id="students"
                value={studentText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="John Doe&#10;Jane Smith, jane@email.com&#10;Mark Johnson, mark@email.com, 555-1234, YEAR_2"
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {/* Preview */}
            {parsedStudents.length > 0 && (
              <div className="space-y-2">
                <Label>Preview ({parsedStudents.length} students)</Label>
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {parsedStudents.map((student, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500 space-x-2">
                          <span>{student.email || '(temp email will be generated)'}</span>
                          {student.phone && <span>• {student.phone}</span>}
                          <Badge variant="outline" className="ml-2">
                            {student.yearLevel === 'YEAR_2' ? 'Year 2' : 'Year 1'}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStudent(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || parsedStudents.length === 0}
              >
                {isSubmitting ? 'Creating...' : `Create ${parsedStudents.length} Student(s)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
