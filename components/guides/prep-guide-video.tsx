'use client'

export function PrepGuideVideo({ id, title }: { id: string; title: string }) {
  const media = `/api/guides/servants-prep/${id}`
  return <video aria-label={`Video guide: ${title}`} controls playsInline preload="none" width={1920} height={1080} className="aspect-video w-full rounded-lg bg-black" poster={`${media}/poster`} onPlay={event => {
    document.querySelectorAll('video').forEach(video => { if (video !== event.currentTarget) video.pause() })
  }}>
    <source src={`${media}/video`} type="video/mp4" />
    <track kind="captions" src={`${media}/captions`} srcLang="en" label="English" />
    Your browser cannot play this video. Follow the written steps alongside it.
  </video>
}
