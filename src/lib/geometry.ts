import type { Crop, Media, Settings } from './types'

export type Size = { w: number; h: number }

/** Frame size after rotation: a 90° turn swaps width and height. */
export function frameSize(media: Pick<Media, 'width' | 'height'>, rotation: number): Size {
  return rotation % 180 === 0
    ? { w: media.width, h: media.height }
    : { w: media.height, h: media.width }
}

export function cropPixels(frame: Size, crop: Crop): Size {
  return { w: frame.w * crop.w, h: frame.h * crop.h }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export function outputSize(media: Media, settings: Settings): Size {
  const frame = frameSize(media, settings.rotation)
  const base = cropPixels(frame, settings.crop)
  let { w, h } = base
  const limit = settings.longEdge
  if (limit > 0 && Math.max(w, h) > limit) {
    const k = limit / Math.max(w, h)
    w *= k
    h *= k
  }
  return { w: even(w), h: even(h) }
}

export function clampCrop(crop: Crop): Crop {
  const w = Math.min(1, Math.max(0.02, crop.w))
  const h = Math.min(1, Math.max(0.02, crop.h))
  const x = Math.min(1 - w, Math.max(0, crop.x))
  const y = Math.min(1 - h, Math.max(0, crop.y))
  return { x, y, w, h }
}

/** Largest centred crop with the requested pixel aspect ratio. */
export function fitCrop(frame: Size, aspect: number | null): Crop {
  if (!aspect) return { x: 0, y: 0, w: 1, h: 1 }
  const frameAspect = frame.w / frame.h
  let w = 1
  let h = 1
  if (frameAspect > aspect) {
    w = (aspect * frame.h) / frame.w
  } else {
    h = frame.w / (aspect * frame.h)
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

export const ASPECT_PRESETS: { label: string; aspect: number | null }[] = [
  { label: 'Free', aspect: null },
  { label: '16:9', aspect: 16 / 9 },
  { label: '9:16', aspect: 9 / 16 },
  { label: '1:1', aspect: 1 },
  { label: '4:5', aspect: 4 / 5 },
  { label: '4:3', aspect: 4 / 3 },
]

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00.0'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
