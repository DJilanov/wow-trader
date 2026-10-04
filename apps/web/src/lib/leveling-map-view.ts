import type { LevelingMapPoint } from "./leveling-map-data";

export interface MapView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export function fullMapView(width: number, height: number): MapView {
  return { x: 0, y: 0, width, height };
}
export function constrainMapView(view: MapView, width: number, height: number): MapView {
  const scale = Math.min(1, Math.max(1 / 8, view.width / width));
  const nextWidth = width * scale,
    nextHeight = height * scale;
  return {
    x: Math.max(0, Math.min(width - nextWidth, view.x)),
    y: Math.max(0, Math.min(height - nextHeight, view.y)),
    width: nextWidth,
    height: nextHeight,
  };
}
export function fitMapPoints(
  width: number,
  height: number,
  points: readonly LevelingMapPoint[],
): MapView {
  const positions = points
    .flatMap((point) => [{ x: point.x, y: point.y }, ...point.outline])
    .filter(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 1 &&
        point.y >= 0 &&
        point.y <= 1,
    );
  if (positions.length === 0) return fullMapView(width, height);
  const xs = positions.map((point) => point.x),
    ys = positions.map((point) => point.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(1, Math.max(0.2, maxX - minX + 0.12, maxY - minY + 0.12));
  return constrainMapView(
    {
      x: ((minX + maxX) / 2 - scale / 2) * width,
      y: ((minY + maxY) / 2 - scale / 2) * height,
      width: width * scale,
      height: height * scale,
    },
    width,
    height,
  );
}
export function zoomMapView(view: MapView, width: number, height: number, factor: number): MapView {
  const scale = Math.min(1, Math.max(1 / 8, (view.width / width) * factor));
  return constrainMapView(
    {
      x: view.x + (view.width - width * scale) / 2,
      y: view.y + (view.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
    },
    width,
    height,
  );
}
