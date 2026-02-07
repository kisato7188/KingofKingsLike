import { SIDEBAR_WIDTH, TILE_SIZE, VIEW_TILES_X, VIEW_TILES_Y } from "./constants";
import { MapData } from "./types";

export const boardToCanvas = (x: number, y: number): { x: number; y: number } => {
  return {
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
  };
};

export const getTileIndex = (x: number, y: number, width: number): number => {
  return y * width + x;
};

export const getViewportWidth = (map: MapData): number => {
  return VIEW_TILES_X * TILE_SIZE + SIDEBAR_WIDTH;
};

export const getViewportHeight = (map: MapData): number => {
  return VIEW_TILES_Y * TILE_SIZE;
};

export const getMapFrameWidth = (): number => {
  return VIEW_TILES_X * TILE_SIZE;
};

export const getMapFrameHeight = (): number => {
  return VIEW_TILES_Y * TILE_SIZE;
};
