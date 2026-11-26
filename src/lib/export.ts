import { outputSize, type Size } from './geometry'
import { drawFrame } from './render'
import type { Media, Settings, Trim } from './types'

function makeCanvas(size: Size): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available in this browser.')
  return { canvas, ctx }
}

export async function exportImage(media: Media, settings: Settings): Promise<Blob> {
  const size = outputSize(media, settings)
  const { canvas, ctx } = makeCanvas(size)
  drawFrame(ctx, size.w, size.h, media, settings, settings.crop)

  const mime = `image/${settings.format}`
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, settings.format === 'png' ? undefined : settings.quality),
  )
  if (!blob) throw new Error(`This browser cannot encode ${settings.format.toUpperCase()}.`)
  if (settings.format !== 'png' && blob.type !== mime) {
    throw new Error(`This browser cannot encode ${settings.format.toUpperCase()}.`)
  }
  return blob
}

/**
 * A <video> element can only be routed through Web Audio once, so the graph is
 * cached per element and reused across exports.
 */
const audioGraphs = new WeakMap<
  HTMLVideoElement,
  { ctx: AudioContext; dest: MediaStreamAudioDestinationNode }
>()

function audioDestination(video: HTMLVideoElement) {
  const cached = audioGraphs.get(video)
  if (cached) return cached
  const ctx = new AudioContext()
  const source = ctx.createMediaElementSource(video)
  const dest = ctx.createMediaStreamDestination()
  // Only the stream destination is wired up, so the clip stays silent in the
  // speakers while it is being recorded.
  source.connect(dest)
  const graph = { ctx, dest }
  audioGraphs.set(video, graph)
  return graph
}

function pickVideoMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

const bitrate = (size: Size) =>
  Math.min(20_000_000, Math.max(2_500_000, Math.round(size.w * size.h * 30 * 0.08)))

function waitForSeek(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
  })
}

/**
 * Records the trimmed range in real time with MediaRecorder. The output is a
 * WebM (VP9 + Opus when the browser supports it); it is a capture, not an
 * ffmpeg render, so a 30 s clip takes 30 s.
 */
export async function exportVideo(
  media: Media,
  settings: Settings,
  trim: Trim,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  const video = media.el as HTMLVideoElement
  const size = outputSize(media, settings)
  const { canvas, ctx } = makeCanvas(size)
  const stream = canvas.captureStream(30)

  try {
    const graph = audioDestination(video)
    await graph.ctx.resume()
    for (const track of graph.dest.stream.getAudioTracks()) stream.addTrack(track)
  } catch {
    // Silent export is better than no export.
  }

  const mime = pickVideoMime()
  const recorder = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: bitrate(size),
  })

  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  video.pause()
  video.currentTime = trim.start
  await waitForSeek(video)
  drawFrame(ctx, size.w, size.h, media, settings, settings.crop)

  recorder.start(200)
  await video.play()

  const span = Math.max(0.1, trim.end - trim.start)
  let frameId = 0
  await new Promise<void>((resolve) => {
    const tick = () => {
      drawFrame(ctx, size.w, size.h, media, settings, settings.crop)
      const t = video.currentTime
      onProgress(Math.min(1, Math.max(0, (t - trim.start) / span)))
      if (t >= trim.end - 0.03 || video.ended) {
        resolve()
        return
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
  })

  cancelAnimationFrame(frameId)
  video.pause()
  recorder.stop()
  await stopped
  video.currentTime = trim.start
  onProgress(1)

  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
