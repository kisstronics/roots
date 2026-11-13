import { useEffect, useRef, useState } from "react";
import {
  CROP_FRAME_H,
  CROP_FRAME_W,
  clampCropOffset,
  clampZoom,
  coverScale,
  cropPhoto,
  initialCropOffset,
  offsetForZoom,
  type CropOffset,
} from "../lib/photo";

interface PhotoCropperProps {
  image: HTMLImageElement;
  onCancel: () => void;
  onUse: (photo: string) => void;
}

export function PhotoCropper({ image, onCancel, onUse }: PhotoCropperProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offset: CropOffset } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>(() => initialCropOffset(image.naturalWidth, image.naturalHeight));
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  zoomRef.current = zoom;
  offsetRef.current = offset;

  const scale = coverScale(image.naturalWidth, image.naturalHeight) * zoom;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = clampZoom(zoomRef.current * (event.deltaY < 0 ? 1.06 : 0.94));
      setOffset(offsetForZoom(image.naturalWidth, image.naturalHeight, offsetRef.current, zoomRef.current, next));
      setZoom(next);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [image]);

  function changeZoom(nextZoom: number) {
    const next = clampZoom(nextZoom);
    setOffset(offsetForZoom(image.naturalWidth, image.naturalHeight, offsetRef.current, zoomRef.current, next));
    setZoom(next);
  }

  return (
    <div className="photo-crop">
      <p className="hint">Drag and zoom. The card shows this area only.</p>
      <div
        ref={frameRef}
        className="crop-frame"
        style={{ width: CROP_FRAME_W, height: CROP_FRAME_H }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, offset };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          setOffset(
            clampCropOffset(
              start.offset.x + (event.clientX - start.x),
              start.offset.y + (event.clientY - start.y),
              image.naturalWidth,
              image.naturalHeight,
              scale,
            ),
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          src={image.src}
          alt=""
          draggable={false}
          style={{
            left: offset.x,
            top: offset.y,
            width: image.naturalWidth * scale,
            height: image.naturalHeight * scale,
          }}
        />
      </div>
      <label className="crop-zoom">
        Zoom
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
          onChange={(event) => changeZoom(Number(event.target.value))}
        />
        <span>{Math.round(zoom * 100)}%</span>
      </label>
      <div className="inline-actions">
        <button type="button" className="button ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={() => onUse(cropPhoto(image, offset, zoom))}>
          Use this photo
        </button>
      </div>
    </div>
  );
}
