import type { Metadata } from 'next'
import DriveFileBrowser from '@/components/drive-file-browser'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'

export const metadata: Metadata = {
  title: 'Files | Servants Prep',
  description: 'Program recordings and materials.',
}

export default function FilesPage() {
  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Files" meta={['Program recordings and materials', 'synced from Google Drive']} />
      <Panel bodyClassName="p-4">
        <DriveFileBrowser />
      </Panel>
    </div>
  )
}
