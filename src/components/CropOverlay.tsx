import { useRef } from 'react'
import { clampCrop } from '../lib/geometry'
import type { Crop } from '../lib/types'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

type DragState = {
  kind: 'move' | 'resize'
  handle: Handle | null
  origin: Crop
  startX: number
  startY: number
  boxW: number
  boxH: number
}

type Props = {
  crop: Crop
  aspect: number | null
  frameAspect: number
  onChange: (crop: Crop) => void
}

function applyDrag(
  state: DragState,
  dx: number,
  dy: number,
  aspect: number | null,
  frameAspect: number,
): Crop {
  if (state.kind === 'move' || !state.handle) {
    return clampCrop({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy })
  }

  const handle = state.handle
  const next = { ...state.origin }
  if (handle.includes('w')) {
    next.x += dx
    next.w -= dx
  }
  if (handle.includes('e')) next.w += dx
  if (handle.includes('n')) {
    next.y += dy
    next.h -= dy
  }
  if (handle.includes('s')) next.h += dy

  // Keep the requested pixel aspect while anchoring the opposite edge.
  if (aspect) {
    if (handle.includes('w') || handle.includes('e')) {
      const wantedH = (next.w * frameAspect) / aspect
      if (handle.includes('n')) next.y += next.h - wantedH
      else if (!handle.includes('s')) next.y += (next.h - wantedH) / 2
      next.h = wantedH
    } else {
      const wantedW = (next.h * aspect) / frameAspect
      if (handle.includes('w')) next.x += next.w - wantedW
      else next.x += (next.w - wantedW) / 2
      next.w = wantedW
    }
  }

  return clampCrop(next)
}

export default function CropOverlay({ crop, aspect, frameAspect, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const handle = (event.target as HTMLElement).dataset.handle as Handle | undefined
    event.preventDefault()
    event.stopPropagation()
    ref.current?.setPointerCapture(event.pointerId)
    drag.current = {
      kind: handle ? 'resize' : 'move',
      handle: handle ?? null,
      origin: crop,
      startX: event.clientX,
      startY: event.clientY,
      boxW: box.width,
      boxH: box.height,
    }
  }

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    const dx = (event.clientX - state.startX) / state.boxW
    const dy = (event.clientY - state.startY) / state.boxH
    onChange(applyDrag(state, dx, dy, aspect, frameAspect))
  }

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (ref.current?.hasPointerCapture(event.pointerId)) {
      ref.current.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={ref}
      className="cropOverlay"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="cropRect"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.w * 100}%`,
          height: `${crop.h * 100}%`,
        }}
      >
        <span className="cropThird vertical first" />
        <span className="cropThird vertical second" />
        <span className="cropThird horizontal first" />
        <span className="cropThird horizontal second" />
        {HANDLES.map((handle) => (
          <span key={handle} data-handle={handle} className={`cropHandle handle-${handle}`} />
        ))}
      </div>
      <span className="cropHint">Drag the box · pull a handle to resize</span>
    </div>
  )
}
