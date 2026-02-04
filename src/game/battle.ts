import { MapData, TileType, Unit } from "./types";
import { getTileIndex } from "./geometry";

export type BattleResult = {
  attacker: Unit;
  defender: Unit;
  attackerDefeated: boolean;
  defenderDefeated: boolean;
  log: string[];
};

export const battle = (attacker: Unit, defender: Unit, map: MapData): BattleResult => {
  const log: string[] = [];
  const attackerAfter = { ...attacker };
  const defenderAfter = { ...defender };

  const firstDamage = calcDamage(attackerAfter, defenderAfter, map);
  defenderAfter.hp -= firstDamage;
  log.push(`${attackerAfter.type} attacks ${defenderAfter.type} (${firstDamage} dmg)`);

  if (defenderAfter.hp > 0) {
    const counterDamage = calcDamage(defenderAfter, attackerAfter, map, true);
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

const calcDamage = (attacker: Unit, defender: Unit, map: MapData, isCounter = false): number => {
  const defenseBonus = getDefenseBonus(map, defender.x, defender.y);
  const power = attacker.power + attacker.level;
  const defense = defender.defense + defenseBonus;
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
