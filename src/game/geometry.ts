import { HUD_HEIGHT, TILE_SIZE } from "./constants";
import { MapData } from "./types";

export const boardToCanvas = (x: number, y: number): { x: number; y: number } => {
  return {
    x: x * TILE_SIZE,
    y: HUD_HEIGHT + y * TILE_SIZE,
  };
};

export const getTileIndex = (x: number, y: number, width: number): number => {
  return y * width + x;
};

export const getViewportWidth = (map: MapData): number => {
  return map.width * TILE_SIZE;
};

export const getViewportHeight = (map: MapData): number => {
  return map.height * TILE_SIZE + HUD_HEIGHT;
};
