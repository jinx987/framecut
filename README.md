# Framecut

One editor for pictures and video. Crop, straighten, colour-grade and caption
either kind of file with the exact same controls, then export.

Everything runs inside the browser tab: the file is decoded by an `<img>` or a
`<video>` element, drawn to a canvas, and saved from that canvas. **Nothing is
uploaded, nothing is installed, there is no backend.**

<!-- A screenshot of the editor with a frame loaded belongs here. -->

## Why images and video in one tool

Most editors split the two: a crop-and-grade panel for photos, a timeline for
clips. Framecut keeps a single `drawFrame()` that both the preview and the
export call, so a recipe means the same thing for a JPEG and for a 30-second
MP4. Rotate, flip, crop, grade, caption and output size are the same six
controls; the only video-specific things are playback and in/out points.

That design decision is also the interesting engineering part:

- **The preview is the export.** `Stage` paints to a canvas sized to the output;
  `exportImage` and `exportVideo` paint to a canvas of the same output size with
  the same function and the same `Crop` values. There is no second rendering
  path to drift out of sync, so a 4:5 crop that looks right looks right in the
  file.
- **Adjustments are resolution independent.** Brightness, contrast, saturation
  and hue are point operations — each output pixel depends only on the matching
  input pixel. Scaling them with `ctx.filter` blurs resampling and grading
  together, which makes a downscaled preview disagree with a full-size render.
  Point ops mean a 1920 px preview and a 3840 px export grade identically.
- **Crop is stored in fractions of the rotated frame.** Rotating 90° swaps the
  frame's width and height, so a crop saved in source pixels would land
  somewhere else after a turn. Stored as fractions, it survives rotation, flip
  and every output size.
- **Aspect presets are enforced in frame-pixel space.** `fitCrop()` compares the
  *rotated, full-resolution* aspect before choosing the largest centred box, so
  choosing 16:9 on a portrait photo crops pixels, not a squashed rectangle.
- **Output sizes are always even.** Video encoders (and most delivery pipelines)
  reject odd dimensions; `outputSize()` rounds to the nearest even pixel and the
  long-edge presets scale instead of stretching.
- **Video export keeps the audio, and keeps it quiet.** The `<video>` element is
  routed through Web Audio to a stream destination only — no speaker
  connection — so the recorded track has sound while the machine stays silent.
  A `<video>` can only be captured through Web Audio once, so the graph is
  cached per element and reused across exports.
- **Trimming is a real loop.** The in/out points clamp playback, the preview
  restarts at the in point instead of running past it, and the recorded range is
  spliced back to the start when the export finishes.

## Features

| | |
| --- | --- |
| **Load** | Drag a file in or use the picker. PNG, JPEG, WebP, GIF, MP4, WebM, MOV. |
| **Crop** | Eight-handle box with thirds guides, six aspect presets (Free, 16:9, 9:16, 1:1, 4:5, 4:3). |
| **Frame** | Rotate 90°, flip horizontally or vertically. |
| **Grade** | Brightness, contrast, saturation, hue — with one-click reset. |
| **Caption** | Burn in up to four lines: size as a share of the frame height, any colour, free position, shadowed so it stays readable. |
| **Trim** | In/out points on a scrubbable timeline; playback loops inside the range. |
| **Export** | Long edge: original, 4K, 1920, 1080, 720. Images to PNG, JPEG or WebP with a quality slider; clips to WebM (VP9 + Opus). |

## Run it

```bash
bun install
bun run dev      # http://127.0.0.1:5181
```

```bash
bun run build    # typecheck + production bundle into dist/
bun run typecheck
```

`dist/` is a static folder — it can be dropped on any static host.

## Use it

1. Drop a photo or a clip on the page.
2. **Frame** → pick an aspect and drag the crop box, or rotate/flip.
3. **Adjust** → nudge brightness, contrast, saturation, hue.
4. **Caption** → turn it on and type; drag the position sliders until it sits right.
5. **Export** → choose a long edge and press **Export image** / **Export clip**.

For video, scrub to where the interesting part starts, press **Set in**, scrub to
the end, press **Set out**, then export.

## Known limits

- **Video export records in real time.** `MediaRecorder` captures the canvas live,
  so a 30-second in/out range takes about 30 seconds and the tab has to stay
  frontmost (browsers throttle animation frames in background tabs). Silent
  re-encoding with ffmpeg.wasm would fix both, at the cost of a 30 MB download.
- **Clips come out as WebM.** That is what `MediaRecorder` gives in Chrome,
  Edge and Firefox. There is no MP4/H.264 encoder in the browser today.
- **No undo history.** The recipe is small and every control is one click from
  its default.
- **Long edges are capped by the source.** "4K" upscales nothing; it only limits.
- **GIFs import as a still frame** — the first one.
- Safari's `MediaRecorder` support is patchy; Chrome or Edge is the tested path.

## Layout

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | State, file loading, trim/playback handlers, the sidebar panels, export flow |
| `src/components/Stage.tsx` | The preview canvas: paints `drawFrame`, repaints on seek, runs the playback loop |
| `src/components/CropOverlay.tsx` | Pointer-capture drag and eight-handle resize, with aspect anchoring |
| `src/lib/render.ts` | `drawFrame` — crop → rotate → flip → grade → draw, then the caption |
| `src/lib/geometry.ts` | Frame/output sizes, crop math, aspect presets, time formatting |
| `src/lib/export.ts` | `toBlob` for stills, `MediaRecorder` + Web Audio for clips, download helper |
| `src/lib/types.ts` | `Settings`, `Media`, `Trim`, defaults |

## Stack

React 19, TypeScript (strict, `noUnusedLocals`), Vite. No canvas, encoding or
media libraries — the platform APIs are the whole dependency list, plus
`lucide-react` for icons and a bundled variable font.

## Licence

MIT — see [LICENSE](LICENSE).
