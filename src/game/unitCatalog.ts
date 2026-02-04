import { UnitType } from "./types";

export type UnitCatalogEntry = {
  type: UnitType;
  name: string;
  hireCost: number;
  movePoints: number;
  food: number;
  power: number;
  defense: number;
  level: number;
  hp: number;
};

export const unitCatalog: Record<UnitType, UnitCatalogEntry> = {
  [UnitType.Fighter]: {
    type: UnitType.Fighter,
    name: "Fighter",
    hireCost: 60,
    movePoints: 3,
    food: 25,
    power: 6,
    defense: 3,
    level: 1,
    hp: 14,
  },
  [UnitType.Archer]: {
    type: UnitType.Archer,
    name: "Archer",
    hireCost: 70,
    movePoints: 3,
    food: 20,
    power: 5,
    defense: 2,
    level: 1,
    hp: 12,
  },
  [UnitType.Knight]: {
    type: UnitType.Knight,
    name: "Knight",
    hireCost: 120,
    movePoints: 4,
    food: 30,
    power: 8,
    defense: 5,
    level: 1,
    hp: 18,
  },
  [UnitType.Mage]: {
    type: UnitType.Mage,
    name: "Mage",
    hireCost: 90,
    movePoints: 3,
    food: 22,
    power: 7,
    defense: 2,
    level: 1,
    hp: 10,
  },
  [UnitType.King]: {
    type: UnitType.King,
    name: "King",
    hireCost: 0,
    movePoints: 4,
    food: 50,
    power: 8,
    defense: 5,
    level: 1,
    hp: 20,
  },
};

export const hireableUnits: UnitType[] = [
  UnitType.Fighter,
  UnitType.Archer,
  UnitType.Knight,
  UnitType.Mage,
];
