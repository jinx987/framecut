import {
  AlertTriangle,
  Check,
  Crop as CropIcon,
  Download,
  Film,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Scissors,
  SlidersHorizontal,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import Stage from './components/Stage'
import { ASPECT_PRESETS, fitCrop, formatTime, frameSize, outputSize } from './lib/geometry'
import { exportImage, exportVideo, saveBlob } from './lib/export'
import {
  defaultSettings,
  type Adjust,
  type Caption,
  type Crop,
  type Media,
  type OutputFormat,
  type Rotation,
  type Settings,
  type Trim,
} from './lib/types'

const SIZES = [
  { value: 0, label: 'Original' },
  { value: 3840, label: '4K — 3840 px' },
  { value: 1920, label: 'Full HD — 1920 px' },
  { value: 1080, label: 'HD — 1080 px' },
  { value: 720, label: 'SD — 720 px' },
]

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'png', label: 'PNG — lossless' },
  { value: 'jpeg', label: 'JPEG — small' },
  { value: 'webp', label: 'WebP — smallest' },
]

const baseName = (name: string) => name.replace(/\.[^./\\]+$/, '')

async function loadImage(url: string, name: string): Promise<Media> {
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    throw new Error('That image could not be read. Try PNG, JPEG or WebP.')
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('That image has no readable dimensions.')
  }
  return {
    kind: 'image',
    name,
    url,
    width: image.naturalWidth,
    height: image.naturalHeight,
    duration: 0,
    el: image,
  }
}

function loadVideo(url: string, name: string, sink: HTMLElement): Promise<Media> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = url
    video.preload = 'auto'
    video.playsInline = true
    video.className = 'hiddenMedia'

    const fail = () => {
      video.remove()
      reject(new Error('That video could not be decoded here. Try MP4 (H.264) or WebM.'))
    }

    video.onerror = fail
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        fail()
        return
      }
      sink.appendChild(video)
      resolve({
        kind: 'video',
        name,
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        el: video,
      })
    }
  })
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const sinkRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<Media | null>(null)

  const [media, setMedia] = useState<Media | null>(null)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [mode, setMode] = useState<'adjust' | 'crop'>('adjust')
  const [aspect, setAspect] = useState<number | null>(null)
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 })
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const patch = (next: Partial<Settings>) => setSettings((s) => ({ ...s, ...next }))
  const patchAdjust = (next: Partial<Adjust>) =>
    setSettings((s) => ({ ...s, adjust: { ...s.adjust, ...next } }))
  const patchCaption = (next: Partial<Caption>) =>
    setSettings((s) => ({ ...s, caption: { ...s.caption, ...next } }))

  const retire = (old: Media | null) => {
    if (!old) return
    if (old.kind === 'video') (old.el as HTMLVideoElement).pause()
    old.el.remove()
    URL.revokeObjectURL(old.url)
  }

  const openFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) {
      setError('That file is neither an image nor a video.')
      return
    }

    setError(null)
    setLoading(true)
    setPlaying(false)

    try {
      const url = URL.createObjectURL(file)
      let next: Media
      if (isImage) {
        next = await loadImage(url, file.name)
      } else {
        const sink = sinkRef.current
        if (!sink) throw new Error('The player is not ready. Try again.')
        next = await loadVideo(url, file.name, sink)
      }

      retire(mediaRef.current)
      mediaRef.current = next
      setMedia(next)
      setSettings(defaultSettings())
      setAspect(null)
      setMode('adjust')
      setTrim({ start: 0, end: next.duration })
      setTime(0)

      if (next.kind === 'video') {
        const video = next.el as HTMLVideoElement
        video.addEventListener('play', () => setPlaying(true))
        video.addEventListener('pause', () => setPlaying(false))
        video.addEventListener('ended', () => setPlaying(false))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that file.')
    } finally {
      setLoading(false)
    }
  }, [])

  const acceptFile = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void openFile(file)
  }

  const chooseAspect = (next: number | null) => {
    if (!media) return
    setAspect(next)
    patch({ crop: fitCrop(frameSize(media, settings.rotation), next) })
  }

  const rotate = () => {
    patch({ rotation: ((settings.rotation + 90) % 360) as Rotation })
  }

  const reportTime = useCallback((seconds: number) => setTime(seconds), [])

  const seek = (value: number) => {
    if (media?.kind !== 'video') return
    ;(media.el as HTMLVideoElement).currentTime = value
    setTime(value)
  }

  const togglePlay = useCallback(() => {
    if (!media || media.kind !== 'video') return
    const video = media.el as HTMLVideoElement
    if (!video.paused) {
      video.pause()
      return
    }
    if (video.currentTime < trim.start || video.currentTime >= trim.end - 0.05) {
      video.currentTime = trim.start
    }
    video.play().catch(() => setError('Playback was blocked. Press play again.'))
  }, [media, trim])

  const setIn = () => {
    if (media?.kind !== 'video') return
    const t = (media.el as HTMLVideoElement).currentTime
    setTrim((current) => ({ ...current, start: Math.max(0, Math.min(t, current.end - 0.2)) }))
  }

  const setOut = () => {
    if (media?.kind !== 'video') return
    const t = (media.el as HTMLVideoElement).currentTime
    setTrim((current) => ({
      ...current,
      end: Math.max(current.start + 0.2, Math.min(t, media.duration)),
    }))
  }

  const exportNow = async () => {
    if (!media || busy) return
    setError(null)

    if (media.kind === 'video') {
      if (trim.end - trim.start < 0.2) {
        setError('Choose an out point at least 0.2 s after the in point.')
        return
      }
      ;(media.el as HTMLVideoElement).pause()
      setBusy({ label: 'Recording the clip in real time', progress: 0 })
      try {
        const blob = await exportVideo(media, settings, trim, (progress) =>
          setBusy({ label: 'Recording the clip in real time', progress }),
        )
        saveBlob(blob, `${baseName(media.name)}-cut.webm`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The clip could not be recorded.')
      } finally {
        setBusy(null)
      }
      return
    }

    setBusy({ label: 'Rendering the image', progress: 0.5 })
    try {
      const blob = await exportImage(media, settings)
      const extension = settings.format === 'jpeg' ? 'jpg' : settings.format
      saveBlob(blob, `${baseName(media.name)}.${extension}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The image could not be rendered.')
    } finally {
      setBusy(null)
    }
  }

  const out = media ? outputSize(media, settings) : null
  const percent = (seconds: number) =>
    media && media.duration > 0 ? (seconds / media.duration) * 100 : 0

  return (
    <div className="app">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hiddenInput"
        onChange={(event) => {
          acceptFile(event.target.files)
          event.target.value = ''
        }}
      />
      <div ref={sinkRef} aria-hidden="true" />

      <header className="header">
        <div className="brand">
          <span className="brandMark">F</span>
          <div>
            <h1>Framecut</h1>
            <p>Image &amp; video editor — local only</p>
          </div>
        </div>
        <div className="headerRight">
          {media && (
            <span className="pill">
              {media.kind === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
              {media.width}×{media.height}
            </span>
          )}
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
            Open file
          </button>
        </div>
      </header>

      {error && (
        <div className="errorBanner">
          <AlertTriangle size={15} />
          <span>{error}</span>
          <button className="btn btnIcon" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <main
        className={`workspace ${dragOver ? 'dragOver' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          acceptFile(event.dataTransfer.files)
        }}
      >
        {!media && (
          <div className="empty">
            <div className="dropCard">
              <span className="dropIcon">
                <Upload size={22} />
              </span>
              <h2>Drop an image or a video</h2>
              <p>
                Crop, rotate, colour-grade and caption both kinds of file with the same controls.
                Your media is decoded in this tab and never uploaded anywhere.
              </p>
              <button className="btn btnPrimary" onClick={() => inputRef.current?.click()}>
                Choose a file
              </button>
              <p className="formats">PNG · JPEG · WEBP · GIF · MP4 · WEBM · MOV</p>
            </div>
          </div>
        )}

        {media && out && (
          <>
            <section className="stageColumn">
              <div className="modeBar">
                <span className="badge">
                  {out.w} × {out.h}
                  {mode === 'crop' ? ' · cropping' : ''}
                </span>
                <button
                  className="btn btnSmall"
                  onClick={() => setMode(mode === 'crop' ? 'adjust' : 'crop')}
                >
                  {mode === 'crop' ? (
                    <>
                      <Check size={14} /> Done
                    </>
                  ) : (
                    <>
                      <CropIcon size={14} /> Crop
                    </>
                  )}
                </button>
              </div>

              <Stage
                media={media}
                settings={settings}
                mode={mode}
                onCrop={(crop: Crop) => patch({ crop })}
                playing={playing}
                trim={trim}
                onTime={reportTime}
                aspect={aspect}
              />

              {busy && (
                <div className="busyBar">
                  <Loader2 className="spin" size={15} />
                  <span>{busy.label}</span>
                  <div className="progress">
                    <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
                  </div>
                  <span>{Math.round(busy.progress * 100)}%</span>
                </div>
              )}

              {media.kind === 'video' && (
                <div className="transport">
                  <div className="transportRow">
                    <button
                      className="btn btnIcon"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pause' : 'Play'}
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <span className="timecode">
                      {formatTime(time)} <i>/</i> {formatTime(media.duration)}
                    </span>
                    <span className="trimInfo">
                      In {formatTime(trim.start)} · Out {formatTime(trim.end)}
                    </span>
                    <span className="spacer" />
                    <button className="btn btnSmall" onClick={setIn}>
                      <Scissors size={13} /> Set in
                    </button>
                    <button className="btn btnSmall" onClick={setOut}>
                      <Scissors size={13} /> Set out
                    </button>
                    <button
                      className="btn btnSmall"
                      onClick={() => setTrim({ start: 0, end: media.duration })}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="timeline">
                    <div
                      className="timelineTrim"
                      style={{
                        left: `${percent(trim.start)}%`,
                        width: `${Math.max(0, percent(trim.end) - percent(trim.start))}%`,
                      }}
                    />
                    <input
                      className="scrub"
                      type="range"
                      min={0}
                      max={Math.max(0.01, media.duration)}
                      step={0.01}
                      value={Math.min(time, media.duration)}
                      onChange={(event) => seek(Number(event.target.value))}
                      aria-label="Scrub timeline"
                    />
                  </div>
                </div>
              )}
            </section>

            <aside className="sidebar">
              <Panel title="Source">
                <p className="fileName" title={media.name}>
                  {media.name}
                </p>
                <div className="metaRow">
                  <span>
                    {media.width} × {media.height}
                  </span>
                  <span>{media.kind === 'video' ? formatTime(media.duration) : 'Still image'}</span>
                </div>
                <button
                  className="btn btnGhost btnWide"
                  onClick={() => inputRef.current?.click()}
                  disabled={loading}
                >
                  <Upload size={14} /> Replace media
                </button>
              </Panel>

              <Panel title="Frame" icon={<CropIcon size={13} />}>
                <div className="chips">
                  {ASPECT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className={`chip ${aspect === preset.aspect ? 'active' : ''}`}
                      onClick={() => chooseAspect(preset.aspect)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="buttonRow">
                  <button className="btn btnGhost" onClick={rotate}>
                    <RotateCw size={15} /> Rotate 90°
                  </button>
                  <button
                    className={`btn btnGhost ${settings.flipH ? 'btnOn' : ''}`}
                    onClick={() => patch({ flipH: !settings.flipH })}
                    aria-pressed={settings.flipH}
                    aria-label="Flip horizontally"
                  >
                    <FlipHorizontal size={15} />
                  </button>
                  <button
                    className={`btn btnGhost ${settings.flipV ? 'btnOn' : ''}`}
                    onClick={() => patch({ flipV: !settings.flipV })}
                    aria-pressed={settings.flipV}
                    aria-label="Flip vertically"
                  >
                    <FlipVertical size={15} />
                  </button>
                </div>
                <button
                  className="btn btnGhost btnWide"
                  onClick={() => setMode(mode === 'crop' ? 'adjust' : 'crop')}
                >
                  <CropIcon size={14} /> {mode === 'crop' ? 'Finish crop' : 'Crop the frame'}
                </button>
              </Panel>

              <Panel title="Adjust" icon={<SlidersHorizontal size={13} />}>
                <Slider
                  label="Brightness"
                  value={settings.adjust.brightness}
                  min={0.4}
                  max={1.6}
                  step={0.01}
                  display={`${Math.round(settings.adjust.brightness * 100)}%`}
                  onChange={(value) => patchAdjust({ brightness: value })}
                />
                <Slider
                  label="Contrast"
                  value={settings.adjust.contrast}
                  min={0.4}
                  max={1.6}
                  step={0.01}
                  display={`${Math.round(settings.adjust.contrast * 100)}%`}
                  onChange={(value) => patchAdjust({ contrast: value })}
                />
                <Slider
                  label="Saturation"
                  value={settings.adjust.saturation}
                  min={0}
                  max={2}
                  step={0.01}
                  display={`${Math.round(settings.adjust.saturation * 100)}%`}
                  onChange={(value) => patchAdjust({ saturation: value })}
                />
                <Slider
                  label="Hue"
                  value={settings.adjust.hue}
                  min={-180}
                  max={180}
                  step={1}
                  display={`${settings.adjust.hue}°`}
                  onChange={(value) => patchAdjust({ hue: value })}
                />
                <button
                  className="btn btnGhost btnWide"
                  onClick={() => patchAdjust({ brightness: 1, contrast: 1, saturation: 1, hue: 0 })}
                >
                  Reset adjustments
                </button>
              </Panel>

              <Panel title="Caption" icon={<Type size={13} />}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={settings.caption.enabled}
                    onChange={(event) => patchCaption({ enabled: event.target.checked })}
                  />
                  <span>Burn in a caption</span>
                </label>
                {settings.caption.enabled && (
                  <>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={settings.caption.value}
                      placeholder="Ship it."
                      onChange={(event) => patchCaption({ value: event.target.value })}
                    />
                    <Slider
                      label="Size"
                      value={settings.caption.size}
                      min={0.02}
                      max={0.2}
                      step={0.005}
                      display={`${Math.round(settings.caption.size * 100)}% of height`}
                      onChange={(value) => patchCaption({ size: value })}
                    />
                    <div className="fieldRow">
                      <label htmlFor="captionColor">Colour</label>
                      <input
                        id="captionColor"
                        type="color"
                        value={settings.caption.color}
                        onChange={(event) => patchCaption({ color: event.target.value })}
                      />
                    </div>
                    <Slider
                      label="Horizontal"
                      value={settings.caption.x}
                      min={0.05}
                      max={0.95}
                      step={0.01}
                      display={`${Math.round(settings.caption.x * 100)}%`}
                      onChange={(value) => patchCaption({ x: value })}
                    />
                    <Slider
                      label="Vertical"
                      value={settings.caption.y}
                      min={0.05}
                      max={0.95}
                      step={0.01}
                      display={`${Math.round(settings.caption.y * 100)}%`}
                      onChange={(value) => patchCaption({ y: value })}
                    />
                  </>
                )}
              </Panel>

              <Panel title="Export" icon={<Download size={13} />}>
                <label className="field">
                  <span>Output size</span>
                  <select
                    value={settings.longEdge}
                    onChange={(event) => patch({ longEdge: Number(event.target.value) })}
                  >
                    {SIZES.map((size) => (
                      <option key={size.value} value={size.value}>
                        {size.label}
                      </option>
                    ))}
                  </select>
                </label>

                {media.kind === 'image' ? (
                  <>
                    <label className="field">
                      <span>Format</span>
                      <select
                        value={settings.format}
                        onChange={(event) =>
                          patch({ format: event.target.value as OutputFormat })
                        }
                      >
                        {FORMATS.map((format) => (
                          <option key={format.value} value={format.value}>
                            {format.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {settings.format !== 'png' && (
                      <Slider
                        label="Quality"
                        value={settings.quality}
                        min={0.4}
                        max={1}
                        step={0.01}
                        display={`${Math.round(settings.quality * 100)}%`}
                        onChange={(value) => patch({ quality: value })}
                      />
                    )}
                  </>
                ) : null}

                <p className="note">
                  {media.kind === 'video'
                    ? `WebM · VP9 + Opus when available. Exports ${formatTime(
                        Math.max(0, trim.end - trim.start),
                      )} and records in real time.`
                    : `Renders ${out.w} × ${out.h} pixels from the crop.`}
                </p>

                <button className="btn btnPrimary btnWide" onClick={exportNow} disabled={!!busy}>
                  <Download size={15} />
                  {media.kind === 'video' ? 'Export clip' : 'Export image'}
                </button>
              </Panel>
            </aside>
          </>
        )}
      </main>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panelTitle">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider">
      <span className="sliderHead">
        <span>{label}</span>
        <span className="sliderValue">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
