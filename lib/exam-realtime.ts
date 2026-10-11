import Pusher from 'pusher'

export const examChannel = (examId: string) => `private-digital-exam-${examId}`
export function examPusher() {
  const { PUSHER_APP_ID: appId, PUSHER_SECRET: secret, NEXT_PUBLIC_PUSHER_KEY: key, NEXT_PUBLIC_PUSHER_CLUSTER: cluster } = process.env
  if (!appId || !secret || !key || !cluster) return null
  return new Pusher({ appId, secret, key, cluster, useTLS: true, timeout: 2000 })
}
// A delivery failure must never undo a committed answer, pause, or submission.
export async function publishExamChange(examId: string) {
  try { await examPusher()?.trigger(examChannel(examId), 'changed', { examId }) }
  catch { console.warn('Digital exam live update failed; dashboard polling remains available.') }
}
