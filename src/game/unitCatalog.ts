import { UnitType } from "./types";

export type UnitCatalogEntry = {
  type: UnitType;
  name: string;
  hireCost: number;
  isCaster: boolean;
  movePoints: number;
  food: number;
  maxFood: number;
  power: number;
  defense: number;
  level: number;
  hp: number;
  maxHp: number;
  promotesTo?: UnitType;
  promoteAtCrown?: boolean;
};

export const unitCatalog: Record<UnitType, UnitCatalogEntry> = {
  [UnitType.Fighter]: {
    type: UnitType.Fighter,
    name: "Fighter",
    hireCost: 60,
    isCaster: false,
    movePoints: 3,
    food: 25,
    maxFood: 25,
    power: 6,
    defense: 3,
    level: 1,
    hp: 14,
    maxHp: 14,
    promotesTo: UnitType.Knight,
    promoteAtCrown: true,
  },
  [UnitType.Archer]: {
    type: UnitType.Archer,
    name: "Archer",
    hireCost: 70,
    isCaster: false,
    movePoints: 3,
    food: 20,
    maxFood: 20,
    power: 5,
    defense: 2,
    level: 1,
    hp: 12,
    maxHp: 12,
  },
  [UnitType.Knight]: {
    type: UnitType.Knight,
    name: "Knight",
    hireCost: 120,
    isCaster: false,
    movePoints: 4,
    food: 30,
    maxFood: 30,
    power: 8,
    defense: 5,
    level: 1,
    hp: 18,
    maxHp: 18,
  },
  [UnitType.Mage]: {
    type: UnitType.Mage,
    name: "Mage",
    hireCost: 90,
    isCaster: true,
    movePoints: 3,
    food: 22,
    maxFood: 22,
    power: 7,
    defense: 2,
    level: 1,
    hp: 10,
    maxHp: 10,
  },
  [UnitType.King]: {
    type: UnitType.King,
    name: "King",
    hireCost: 0,
    isCaster: false,
    movePoints: 4,
    food: 50,
    maxFood: 50,
    power: 8,
    defense: 5,
    level: 1,
    hp: 20,
    maxHp: 20,
  },
};

export const hireableUnits: UnitType[] = [
  UnitType.Fighter,
  UnitType.Archer,
  UnitType.Knight,
  UnitType.Mage,
];
