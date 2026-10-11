import { LoadingStatus } from '@/components/ui/loading-status'

export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <LoadingStatus label="Loading page…" />
    </div>
  )
}
