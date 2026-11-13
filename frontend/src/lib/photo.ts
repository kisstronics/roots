import { CARD_PHOTO_ASPECT } from "./layout";

export const CROP_FRAME_W = 268;
export const CROP_FRAME_H = Math.round(CROP_FRAME_W / CARD_PHOTO_ASPECT);
export const CROP_OUTPUT_W = 472;
export const CROP_OUTPUT_H = Math.round(CROP_OUTPUT_W / CARD_PHOTO_ASPECT);

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const FRAME = { width: CROP_FRAME_W, height: CROP_FRAME_H };

export interface CropOffset {
  x: number;
  y: number;
}

export function coverScale(imageWidth: number, imageHeight: number, frame = FRAME): number {
  return Math.max(frame.width / imageWidth, frame.height / imageHeight);
}

export function clampCropOffset(
  offsetX: number,
  offsetY: number,
  imageWidth: number,
  imageHeight: number,
  scale: number,
  frame = FRAME,
): CropOffset {
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: Math.min(0, Math.max(frame.width - width, offsetX)),
    y: Math.min(0, Math.max(frame.height - height, offsetY)),
  };
}

export function initialCropOffset(imageWidth: number, imageHeight: number, frame = FRAME): CropOffset {
  const scale = coverScale(imageWidth, imageHeight, frame);
  return clampCropOffset(
    (frame.width - imageWidth * scale) / 2,
    (frame.height - imageHeight * scale) / 2,
    imageWidth,
    imageHeight,
    scale,
    frame,
  );
}

export function offsetForZoom(
  imageWidth: number,
  imageHeight: number,
  offset: CropOffset,
  fromZoom: number,
  toZoom: number,
  frame = FRAME,
): CropOffset {
  const cover = coverScale(imageWidth, imageHeight, frame);
  const oldScale = cover * fromZoom;
  const newScale = cover * clampZoom(toZoom);
  const centerX = (frame.width / 2 - offset.x) / oldScale;
  const centerY = (frame.height / 2 - offset.y) / oldScale;
  return clampCropOffset(
    frame.width / 2 - centerX * newScale,
    frame.height / 2 - centerY * newScale,
    imageWidth,
    imageHeight,
    newScale,
    frame,
  );
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function cropPhoto(image: HTMLImageElement, offset: CropOffset, zoom: number, frame = FRAME): string {
  const scale = coverScale(image.naturalWidth, image.naturalHeight, frame) * clampZoom(zoom);
  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUTPUT_W;
  canvas.height = CROP_OUTPUT_H;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare that photo.");
  context.drawImage(
    image,
    -offset.x / scale,
    -offset.y / scale,
    frame.width / scale,
    frame.height / scale,
    0,
    0,
    CROP_OUTPUT_W,
    CROP_OUTPUT_H,
  );
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function loadPhotoFile(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Choose an image file."));
  const url = URL.createObjectURL(file);
  return loadImage(url)
    .then((image) => ({
      image,
      release: () => URL.revokeObjectURL(url),
    }))
    .catch((error) => {
      URL.revokeObjectURL(url);
      throw error;
    });
}

export function loadPhotoUrl(src: string): Promise<HTMLImageElement> {
  return loadImage(src);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image."));
    image.src = src;
  });
}
