// Frames belong to image URLs, so changing photo order preserves the crop.
export function imageFrameStyle(product, url) {
  const frame = product.imageFrames?.find((f) => f.url === url);
  const coordinate = (v) => Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
  return `object-fit:${frame?.fit === 'contain' ? 'contain' : 'cover'};object-position:${coordinate(frame?.x)}% ${coordinate(frame?.y)}%`;
}
