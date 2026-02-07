import { FactionId, Scenario, Tile, TileType, UnitType } from "../game/types";
import { getTileIndex } from "../game/geometry";

const width = 40;
const height = 40;

const blueCastle = { x: 4, y: 4 };
const redCastle = { x: 35, y: 35 };

const tiles: Tile[] = Array.from({ length: width * height }, () => ({ type: TileType.Grass }));

const setTile = (x: number, y: number, type: TileType, ownerFaction?: FactionId | null): void => {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = getTileIndex(x, y, width);
  tiles[index] = type === TileType.Town || type === TileType.Castle ? { type, ownerFaction: ownerFaction ?? null } : { type };
};

const setTerrainIfGrass = (x: number, y: number, type: TileType): void => {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const index = getTileIndex(x, y, width);
  if (tiles[index].type !== TileType.Grass) {
    return;
  }
  tiles[index] = { type };
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

const route1 = [blueCastle, { x: 20, y: 20 }, redCastle];
const route2 = [blueCastle, { x: 20, y: 8 }, redCastle];
const route3 = [blueCastle, { x: 8, y: 30 }, redCastle];

[route1, route2, route3].forEach(drawRoute);

setTile(blueCastle.x, blueCastle.y, TileType.Castle, FactionId.Blue);
setTile(redCastle.x, redCastle.y, TileType.Castle, FactionId.Red);

const townsOnRoutes = [
  { x: 12, y: 12 },
  { x: 28, y: 28 },
  { x: 16, y: 4 },
  { x: 30, y: 8 },
  { x: 8, y: 20 },
  { x: 20, y: 30 },
  { x: 24, y: 20 },
  { x: 12, y: 28 },
];

const townsOffRoutes = [
  { x: 6, y: 16 },
  { x: 32, y: 16 },
  { x: 18, y: 34 },
  { x: 34, y: 6 },
];

[...townsOnRoutes, ...townsOffRoutes].forEach((town) => {
  setTile(town.x, town.y, TileType.Town, null);
});

const forestRings = [
  { center: { x: 18, y: 34 }, radius: 2 },
  { center: { x: 6, y: 16 }, radius: 2 },
];

for (const ring of forestRings) {
  for (let dy = -ring.radius; dy <= ring.radius; dy += 1) {
    for (let dx = -ring.radius; dx <= ring.radius; dx += 1) {
      const x = ring.center.x + dx;
      const y = ring.center.y + dy;
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (Math.abs(dx) + Math.abs(dy) > ring.radius + 1) {
        continue;
      }
      setTerrainIfGrass(x, y, TileType.Forest);
    }
  }
}

const forestClusters = [
  { x: 10, y: 22, w: 6, h: 5 },
  { x: 24, y: 12, w: 7, h: 6 },
  { x: 28, y: 24, w: 6, h: 6 },
];

for (const cluster of forestClusters) {
  for (let y = cluster.y; y < cluster.y + cluster.h; y += 1) {
    for (let x = cluster.x; x < cluster.x + cluster.w; x += 1) {
      setTerrainIfGrass(x, y, TileType.Forest);
    }
  }
}

const mountainRidgeY = { start: 8, end: 32, gapStart: 18, gapEnd: 20 };
for (let y = mountainRidgeY.start; y <= mountainRidgeY.end; y += 1) {
  if (y >= mountainRidgeY.gapStart && y <= mountainRidgeY.gapEnd) {
    continue;
  }
  setTerrainIfGrass(20, y, TileType.Mountain);
  setTerrainIfGrass(21, y, TileType.Mountain);
}

const mountainClusters = [
  { x: 26, y: 16, w: 6, h: 4 },
  { x: 12, y: 6, w: 5, h: 5 },
  { x: 30, y: 30, w: 5, h: 5 },
];

for (const cluster of mountainClusters) {
  for (let y = cluster.y; y < cluster.y + cluster.h; y += 1) {
    for (let x = cluster.x; x < cluster.x + cluster.w; x += 1) {
      setTerrainIfGrass(x, y, TileType.Mountain);
    }
  }
}

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
