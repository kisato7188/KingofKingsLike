import { SIDEBAR_WIDTH, TILE_SIZE } from "./constants";
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
  return map.width * TILE_SIZE + SIDEBAR_WIDTH;
};

export const getViewportHeight = (map: MapData): number => {
  return map.height * TILE_SIZE;
};
