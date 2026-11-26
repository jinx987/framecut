import { useEffect, useRef } from 'react'
import { frameSize, outputSize } from '../lib/geometry'
import { drawFrame, previewSurface } from '../lib/render'
import { FULL_CROP, type Crop, type Media, type Settings, type Trim } from '../lib/types'
import CropOverlay from './CropOverlay'

type Props = {
  media: Media
  settings: Settings
  mode: 'adjust' | 'crop'
  onCrop: (crop: Crop) => void
  playing: boolean
  trim: Trim
  onTime: (seconds: number) => void
  aspect: number | null
}

export default function Stage({
  media,
  settings,
  mode,
  onCrop,
  playing,
  trim,
  onTime,
  aspect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewCrop = mode === 'crop' ? FULL_CROP : settings.crop
  const frame = frameSize(media, settings.rotation)
  const surface = previewSurface(mode === 'crop' ? frame : outputSize(media, settings))

  // Static paint, plus a repaint whenever a paused video is seeked.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const paint = () => drawFrame(ctx, canvas.width, canvas.height, media, settings, viewCrop)
    paint()
    if (media.kind !== 'video') return
    const video = media.el as HTMLVideoElement
    video.addEventListener('seeked', paint)
    return () => video.removeEventListener('seeked', paint)
  }, [media, settings, viewCrop])

  // Playback loop, looping inside the trim range.
  useEffect(() => {
    if (media.kind !== 'video' || !playing) return
    const video = media.el as HTMLVideoElement
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let frameId = 0
    let lastReport = 0
    const loop = () => {
      if (video.currentTime >= trim.end) video.currentTime = trim.start
      drawFrame(ctx, canvas.width, canvas.height, media, settings, viewCrop)
      const now = performance.now()
      if (now - lastReport > 120) {
        lastReport = now
        onTime(video.currentTime)
      }
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [media, settings, viewCrop, playing, trim.start, trim.end, onTime])

  return (
    <div className="stage">
      <div className="canvasWrap">
        <canvas ref={canvasRef} width={surface.w} height={surface.h} className="canvas" />
        {mode === 'crop' && (
          <CropOverlay
            crop={settings.crop}
            aspect={aspect}
            frameAspect={frame.w / frame.h}
            onChange={onCrop}
          />
        )}
      </div>
    </div>
  )
}
