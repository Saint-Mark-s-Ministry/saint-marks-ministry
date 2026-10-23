export interface MeetingHistorySummary {
  id: string
  date: string
  title: string | null
  ageGroupName: string
  academicYearName: string
  presentCount: number
  absentCount: number
  recordedCount: number
}

export interface MeetingHistoryList {
  meetings: MeetingHistorySummary[]
  nextCursor: string | null
}

export interface MeetingHistoryDetail extends MeetingHistorySummary {
  attendance: Array<{ id: string; name: string; status: 'PRESENT' | 'ABSENT' }>
}
