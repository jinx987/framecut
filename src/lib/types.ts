export type Rotation = 0 | 90 | 180 | 270

/** Crop rectangle as fractions of the rotated frame. */
export type Crop = { x: number; y: number; w: number; h: number }

export type Adjust = {
  brightness: number
  contrast: number
  saturation: number
  hue: number
}

export type Caption = {
  enabled: boolean
  value: string
  /** Font size as a fraction of the exported height. */
  size: number
  color: string
  /** Anchor position as fractions of the exported frame. */
  x: number
  y: number
}

export type OutputFormat = 'png' | 'jpeg' | 'webp'

export type Settings = {
  rotation: Rotation
  flipH: boolean
  flipV: boolean
  crop: Crop
  adjust: Adjust
  caption: Caption
  format: OutputFormat
  quality: number
  /** Longest edge in pixels; 0 keeps the source resolution. */
  longEdge: number
}

export type Media = {
  kind: 'image' | 'video'
  name: string
  url: string
  width: number
  height: number
  /** Seconds; 0 for images. */
  duration: number
  el: HTMLImageElement | HTMLVideoElement
}

export type Trim = { start: number; end: number }

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

export function defaultSettings(): Settings {
  return {
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: { ...FULL_CROP },
    adjust: { brightness: 1, contrast: 1, saturation: 1, hue: 0 },
    caption: {
      enabled: false,
      value: '',
      size: 0.07,
      color: '#ffffff',
      x: 0.5,
      y: 0.86,
    },
    format: 'png',
    quality: 0.92,
    longEdge: 0,
  }
}
