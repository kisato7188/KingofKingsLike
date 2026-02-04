import { FactionId, Scenario, Tile, TileType, UnitType } from "../game/types";
import { getTileIndex } from "../game/geometry";

const layout = [
  "GGGGGGGGGGGG",
  "GGFFGGGGRRGG",
  "GGFTGGGGRRGG",
  "GGFFGGGGGGGG",
  "GGGGGGMMMGGG",
  "GGGGGGRRRGGG",
  "GGGGGGGGGGGG",
  "GGRRGGGGGCGG",
  "GGRRGGGGGGGG",
  "GGGGGGGGGGGG",
];

const width = layout[0].length;
const height = layout.length;

const legend: Record<string, TileType> = {
  G: TileType.Grass,
  R: TileType.Road,
  F: TileType.Forest,
  M: TileType.Mountain,
  T: TileType.Town,
  C: TileType.Castle,
};

const owners = new Map<number, FactionId | null>();
owners.set(getTileIndex(3, 2, width), FactionId.Red);
owners.set(getTileIndex(9, 7, width), FactionId.Blue);

const tiles: Tile[] = layout.flatMap((row, y) =>
  [...row].map((char, x) => {
    const type = legend[char] ?? TileType.Grass;
    if (type === TileType.Town || type === TileType.Castle) {
      const key = getTileIndex(x, y, width);
      return {
        type,
        ownerFaction: owners.get(key) ?? null,
      };
    }
    return { type };
  }),
);

export const sampleScenario: Scenario = {
  id: "sample",
  name: "サンプル戦役",
  factions: [
    { id: FactionId.Blue, name: "青軍", color: "#4dabf7" },
    { id: FactionId.Red, name: "紅軍", color: "#ff6b6b" },
    { id: FactionId.Yellow, name: "黄軍", color: "#f2c94c" },
    { id: FactionId.Green, name: "緑軍", color: "#51cf66" },
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
      x: 1,
      y: 1,
      movePoints: 4,
      food: 50,
      maxFood: 50,
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
      x: 2,
      y: 3,
      movePoints: 3,
      food: 30,
      maxFood: 30,
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
      id: 3,
      type: UnitType.King,
      faction: FactionId.Red,
      x: 9,
      y: 8,
      movePoints: 4,
      food: 50,
      maxFood: 50,
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
      x: 8,
      y: 6,
      movePoints: 3,
      food: 30,
      maxFood: 30,
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
      type: UnitType.Fighter,
      faction: FactionId.Yellow,
      x: 5,
      y: 1,
      movePoints: 3,
      food: 30,
      maxFood: 30,
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
      id: 6,
      type: UnitType.King,
      faction: FactionId.Green,
      x: 6,
      y: 8,
      movePoints: 4,
      food: 50,
      maxFood: 50,
      acted: false,
      power: 8,
      defense: 5,
      level: 1,
      exp: 0,
      crown: false,
      hp: 20,
      maxHp: 20,
    },
  ],
};
