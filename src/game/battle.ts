import { MapData, TileType, Unit, UnitType } from "./types";
import { getTileIndex } from "./geometry";

export type BattleConfig = {
  levelBonusAttack: number;
  applyDefenderLevelBonus: boolean;
  affinityMultiplier?: Partial<Record<UnitType, Partial<Record<UnitType, number>>>>;
};

export const defaultBattleConfig: BattleConfig = {
  levelBonusAttack: 1,
  applyDefenderLevelBonus: false,
};

export type BattleResult = {
  attacker: Unit;
  defender: Unit;
  attackerDefeated: boolean;
  defenderDefeated: boolean;
  log: string[];
};

export const battle = (attacker: Unit, defender: Unit, map: MapData, config: BattleConfig = defaultBattleConfig): BattleResult => {
  const log: string[] = [];
  const attackerAfter = { ...attacker };
  const defenderAfter = { ...defender };

  const firstDamage = calcDamage(attackerAfter, defenderAfter, map, config);
  defenderAfter.hp -= firstDamage;
  log.push(`${attackerAfter.type} attacks ${defenderAfter.type} (${firstDamage} dmg)`);

  if (defenderAfter.hp > 0 && canCounterattack(attackerAfter, defenderAfter)) {
    const counterDamage = calcDamage(defenderAfter, attackerAfter, map, config, true);
    attackerAfter.hp -= counterDamage;
    log.push(`${defenderAfter.type} counterattacks ${attackerAfter.type} (${counterDamage} dmg)`);
  }

  return {
    attacker: attackerAfter,
    defender: defenderAfter,
    attackerDefeated: attackerAfter.hp <= 0,
    defenderDefeated: defenderAfter.hp <= 0,
    log,
  };
};

const canCounterattack = (attacker: Unit, defender: Unit): boolean => {
  const range = getAttackRange(defender);
  const dx = Math.abs(defender.x - attacker.x);
  const dy = Math.abs(defender.y - attacker.y);
  if (dx === 0 && dy === 0) {
    return false;
  }
  return dx + dy <= range;
};

const getAttackRange = (unit: Unit): number => {
  if (unit.type === UnitType.Archer || unit.type === UnitType.Mage || unit.type === UnitType.Wizard) {
    return 3;
  }
  return 1;
};

const calcDamage = (attacker: Unit, defender: Unit, map: MapData, config: BattleConfig, isCounter = false): number => {
  const defenseBonus = getDefenseBonus(map, defender.x, defender.y);
  const power = attacker.power + attacker.level * config.levelBonusAttack;
  const defenseLevel = config.applyDefenderLevelBonus ? defender.level : 0;
  const defense = defender.defense + defenseBonus + defenseLevel;
  const base = power - defense;
  const damage = Math.max(1, base);
  return damage;
};

const getDefenseBonus = (map: MapData, x: number, y: number): number => {
  const tile = map.tiles[getTileIndex(x, y, map.width)];
  switch (tile.type) {
    case TileType.Forest:
      return 1;
    case TileType.Mountain:
      return 2;
    case TileType.Town:
      return 1;
    case TileType.Castle:
      return 2;
    case TileType.Grass:
    case TileType.Road:
    default:
      return 0;
  }
};

export const getExpMultiplier = (
  attackerType: UnitType,
  defenderType: UnitType,
  table?: Partial<Record<UnitType, Partial<Record<UnitType, number>>>>,
): number => {
  const value = table?.[attackerType]?.[defenderType];
  return value ?? 1;
};
