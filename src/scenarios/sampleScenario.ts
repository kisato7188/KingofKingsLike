import { FactionId, Scenario, Tile, TileType, UnitType } from "../game/types";
import { getTileIndex } from "../game/geometry";
import { unitCatalog } from "../game/unitCatalog";

const width = 30;
const height = 30;

const blueCastle = { x: 3, y: 3 };
const redCastle = { x: 26, y: 26 };

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

const route1 = [blueCastle, { x: 15, y: 15 }, redCastle];
const route2 = [blueCastle, { x: 15, y: 6 }, redCastle];
const route3 = [blueCastle, { x: 6, y: 22 }, redCastle];

[route1, route2, route3].forEach(drawRoute);

setTile(blueCastle.x, blueCastle.y, TileType.Castle, FactionId.Blue);
setTile(redCastle.x, redCastle.y, TileType.Castle, FactionId.Red);

const townsOnRoutes = [
  { x: 9, y: 9 },
  { x: 21, y: 21 },
  { x: 12, y: 3 },
  { x: 22, y: 6 },
  { x: 6, y: 14 },
  { x: 15, y: 22 },
  { x: 18, y: 15 },
  { x: 9, y: 20 },
  { x: 5, y: 3 },
  { x: 3, y: 6 },
  { x: 24, y: 26 },
  { x: 26, y: 24 },
];

const townsOffRoutes = [
  { x: 5, y: 12 },
  { x: 24, y: 12 },
  { x: 14, y: 26 },
  { x: 24, y: 4 },
];

[...townsOnRoutes, ...townsOffRoutes].forEach((town) => {
  setTile(town.x, town.y, TileType.Town, null);
});

const redOccupiedTowns = [
  { x: 5, y: 12 },
  { x: 9, y: 9 },
  { x: 12, y: 3 },
];

for (const town of redOccupiedTowns) {
  setTile(town.x, town.y, TileType.Town, FactionId.Red);
}

const forestRings = [
  { center: { x: 14, y: 26 }, radius: 2 },
  { center: { x: 5, y: 12 }, radius: 2 },
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
  { x: 8, y: 16, w: 5, h: 4 },
  { x: 18, y: 10, w: 6, h: 5 },
  { x: 20, y: 18, w: 5, h: 5 },
];

for (const cluster of forestClusters) {
  for (let y = cluster.y; y < cluster.y + cluster.h; y += 1) {
    for (let x = cluster.x; x < cluster.x + cluster.w; x += 1) {
      setTerrainIfGrass(x, y, TileType.Forest);
    }
  }
}

const mountainRidgeY = { start: 6, end: 24, gapStart: 14, gapEnd: 16 };
for (let y = mountainRidgeY.start; y <= mountainRidgeY.end; y += 1) {
  if (y >= mountainRidgeY.gapStart && y <= mountainRidgeY.gapEnd) {
    continue;
  }
  setTerrainIfGrass(15, y, TileType.Mountain);
  setTerrainIfGrass(16, y, TileType.Mountain);
}

const mountainClusters = [
  { x: 18, y: 12, w: 5, h: 4 },
  { x: 10, y: 5, w: 4, h: 4 },
  { x: 6, y: 22, w: 4, h: 4 },
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
      movePoints: unitCatalog[UnitType.King].movePoints,
      food: unitCatalog[UnitType.King].food,
      maxFood: unitCatalog[UnitType.King].maxFood,
      movedThisTurn: false,
      acted: false,
      power: unitCatalog[UnitType.King].power,
      defense: unitCatalog[UnitType.King].defense,
      level: unitCatalog[UnitType.King].level,
      exp: 0,
      crown: false,
      hp: unitCatalog[UnitType.King].hp,
      maxHp: unitCatalog[UnitType.King].maxHp,
    },
    {
      id: 2,
      type: UnitType.King,
      faction: FactionId.Red,
      x: redCastle.x,
      y: redCastle.y,
      movePoints: unitCatalog[UnitType.King].movePoints,
      food: unitCatalog[UnitType.King].food,
      maxFood: unitCatalog[UnitType.King].maxFood,
      movedThisTurn: false,
      acted: false,
      power: unitCatalog[UnitType.King].power,
      defense: unitCatalog[UnitType.King].defense,
      level: unitCatalog[UnitType.King].level,
      exp: 0,
      crown: false,
      hp: unitCatalog[UnitType.King].hp,
      maxHp: unitCatalog[UnitType.King].maxHp,
    },
    {
      id: 3,
      type: UnitType.Fighter,
      faction: FactionId.Red,
      x: 5,
      y: 12,
      movePoints: unitCatalog[UnitType.Fighter].movePoints,
      food: unitCatalog[UnitType.Fighter].food,
      maxFood: unitCatalog[UnitType.Fighter].maxFood,
      movedThisTurn: false,
      acted: false,
      power: unitCatalog[UnitType.Fighter].power,
      defense: unitCatalog[UnitType.Fighter].defense,
      level: unitCatalog[UnitType.Fighter].level,
      exp: 0,
      crown: false,
      hp: unitCatalog[UnitType.Fighter].hp,
      maxHp: unitCatalog[UnitType.Fighter].maxHp,
    },
    {
      id: 4,
      type: UnitType.Fighter,
      faction: FactionId.Red,
      x: 9,
      y: 9,
      movePoints: unitCatalog[UnitType.Fighter].movePoints,
      food: unitCatalog[UnitType.Fighter].food,
      maxFood: unitCatalog[UnitType.Fighter].maxFood,
      movedThisTurn: false,
      acted: false,
      power: unitCatalog[UnitType.Fighter].power,
      defense: unitCatalog[UnitType.Fighter].defense,
      level: unitCatalog[UnitType.Fighter].level,
      exp: 0,
      crown: false,
      hp: unitCatalog[UnitType.Fighter].hp,
      maxHp: unitCatalog[UnitType.Fighter].maxHp,
    },
    {
      id: 5,
      type: UnitType.Fighter,
      faction: FactionId.Red,
      x: 12,
      y: 3,
      movePoints: unitCatalog[UnitType.Fighter].movePoints,
      food: unitCatalog[UnitType.Fighter].food,
      maxFood: unitCatalog[UnitType.Fighter].maxFood,
      movedThisTurn: false,
      acted: false,
      power: unitCatalog[UnitType.Fighter].power,
      defense: unitCatalog[UnitType.Fighter].defense,
      level: unitCatalog[UnitType.Fighter].level,
      exp: 0,
      crown: false,
      hp: unitCatalog[UnitType.Fighter].hp,
      maxHp: unitCatalog[UnitType.Fighter].maxHp,
    },
  ],
};
