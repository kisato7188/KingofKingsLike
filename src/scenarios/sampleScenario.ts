import { FactionId, Scenario, Tile, TileType, UnitType } from "../game/types";
import { getTileIndex } from "../game/geometry";

const width = 80;
const height = 80;

const blueCastle = { x: 6, y: 6 };
const redCastle = { x: 73, y: 73 };

const tiles: Tile[] = Array.from({ length: width * height }, () => ({ type: TileType.Grass }));

const setTile = (x: number, y: number, type: TileType, ownerFaction?: FactionId | null): void => {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = getTileIndex(x, y, width);
  tiles[index] = type === TileType.Town || type === TileType.Castle ? { type, ownerFaction: ownerFaction ?? null } : { type };
};

const drawManhattan = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
  const stepX = from.x <= to.x ? 1 : -1;
  const stepY = from.y <= to.y ? 1 : -1;
  for (let x = from.x; x !== to.x; x += stepX) {
    setTile(x, from.y, TileType.Road);
  }
  setTile(to.x, from.y, TileType.Road);
  for (let y = from.y; y !== to.y; y += stepY) {
    setTile(to.x, y, TileType.Road);
  }
  setTile(to.x, to.y, TileType.Road);
};

const drawRoute = (points: Array<{ x: number; y: number }>): void => {
  for (let i = 0; i < points.length - 1; i += 1) {
    drawManhattan(points[i], points[i + 1]);
  }
};

const route1 = [blueCastle, { x: 40, y: 40 }, redCastle];
const route2 = [blueCastle, { x: 40, y: 12 }, redCastle];
const route3 = [blueCastle, { x: 12, y: 68 }, redCastle];

[route1, route2, route3].forEach(drawRoute);

setTile(blueCastle.x, blueCastle.y, TileType.Castle, FactionId.Blue);
setTile(redCastle.x, redCastle.y, TileType.Castle, FactionId.Red);

const townsOnRoutes = [
  { x: 24, y: 24 },
  { x: 56, y: 56 },
  { x: 30, y: 6 },
  { x: 60, y: 12 },
  { x: 12, y: 40 },
  { x: 40, y: 68 },
];

const townsOffRoutes = [
  { x: 10, y: 20 },
  { x: 70, y: 30 },
  { x: 30, y: 70 },
];

[...townsOnRoutes, ...townsOffRoutes].forEach((town) => {
  setTile(town.x, town.y, TileType.Town, null);
});

export const sampleScenario: Scenario = {
  id: "sample",
  name: "サンプル戦役",
  factions: [
    { id: FactionId.Blue, name: "青軍", color: "#4dabf7" },
    { id: FactionId.Red, name: "紅軍", color: "#ff6b6b" },
  ],
  map: {
    width,
    height,
    tiles,
  },
  units: [
    {
      id: 1,
      type: UnitType.King,
      faction: FactionId.Blue,
      x: blueCastle.x,
      y: blueCastle.y,
      movePoints: 4,
      food: 50,
      maxFood: 50,
      movedThisTurn: false,
      acted: false,
      power: 8,
      defense: 5,
      level: 1,
      exp: 0,
      crown: false,
      hp: 20,
      maxHp: 20,
    },
    {
      id: 2,
      type: UnitType.Fighter,
      faction: FactionId.Blue,
      x: blueCastle.x + 2,
      y: blueCastle.y + 2,
      movePoints: 3,
      food: 30,
      maxFood: 30,
      movedThisTurn: false,
      acted: false,
      power: 6,
      defense: 3,
      level: 1,
      exp: 0,
      crown: false,
      hp: 14,
      maxHp: 14,
    },
    {
      id: 5,
      type: UnitType.Wizard,
      faction: FactionId.Blue,
      x: blueCastle.x + 3,
      y: blueCastle.y,
      movePoints: 3,
      food: 24,
      maxFood: 24,
      movedThisTurn: false,
      acted: false,
      power: 7,
      defense: 3,
      level: 1,
      exp: 0,
      crown: false,
      hp: 12,
      maxHp: 12,
    },
    {
      id: 3,
      type: UnitType.King,
      faction: FactionId.Red,
      x: redCastle.x,
      y: redCastle.y,
      movePoints: 4,
      food: 50,
      maxFood: 50,
      movedThisTurn: false,
      acted: false,
      power: 8,
      defense: 5,
      level: 1,
      exp: 0,
      crown: false,
      hp: 20,
      maxHp: 20,
    },
    {
      id: 4,
      type: UnitType.Fighter,
      faction: FactionId.Red,
      x: redCastle.x - 2,
      y: redCastle.y - 2,
      movePoints: 3,
      food: 30,
      maxFood: 30,
      movedThisTurn: false,
      acted: false,
      power: 6,
      defense: 3,
      level: 1,
      exp: 0,
      crown: false,
      hp: 14,
      maxHp: 14,
    },
  ],
};
