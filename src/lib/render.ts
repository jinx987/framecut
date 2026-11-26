import { cropPixels, frameSize } from './geometry'
import type { Caption, Crop, Media, Settings } from './types'

/**
 * Draws the cropped, rotated, flipped, graded frame into a canvas of any size.
 * The same function renders the preview and the export, so what you see is what
 * you get. Brightness/contrast/saturation/hue are point operations, which means
 * they are independent of the output resolution.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  targetW: number,
  targetH: number,
  media: Media,
  settings: Settings,
  crop: Crop,
): void {
  const frame = frameSize(media, settings.rotation)
  const box = cropPixels(frame, crop)

  ctx.save()
  ctx.clearRect(0, 0, targetW, targetH)
  ctx.scale(targetW / box.w, targetH / box.h)
  ctx.translate(-crop.x * frame.w, -crop.y * frame.h)
  ctx.translate(frame.w / 2, frame.h / 2)
  ctx.scale(settings.flipH ? -1 : 1, settings.flipV ? -1 : 1)
  ctx.rotate((settings.rotation * Math.PI) / 180)

  const { brightness, contrast, saturation, hue } = settings.adjust
  if (brightness !== 1 || contrast !== 1 || saturation !== 1 || hue !== 0) {
    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg)`
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(media.el, -media.width / 2, -media.height / 2, media.width, media.height)
  ctx.restore()

  if (settings.caption.enabled && settings.caption.value.trim()) {
    drawCaption(ctx, targetW, targetH, settings.caption)
  }
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  caption: Caption,
): void {
  const size = Math.max(6, caption.size * height)
  const lineHeight = size * 1.16
  const lines = caption.value.split('\n').slice(0, 4)

  ctx.save()
  ctx.font = `800 ${size}px "Plus Jakarta Sans Variable", system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = caption.color
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = size * 0.3
  ctx.shadowOffsetY = size * 0.06

  const startY = caption.y * height - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, caption.x * width, startY + i * lineHeight, width * 0.94)
  })
  ctx.restore()
}

/** Largest preview surface for the given shape, capped for smooth playback. */
export function previewSurface(size: { w: number; h: number }, cap = 1280) {
  const k = Math.min(1, cap / Math.max(size.w, size.h))
  return { w: Math.max(2, Math.round(size.w * k)), h: Math.max(2, Math.round(size.h * k)) }
}
