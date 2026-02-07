import { getTileIndex } from "../geometry";
import {
  attackUnit,
  canHireAtCastle,
  canOccupy,
  canSupply,
  endTurn,
  GameState,
  getHireSpawnPosition,
  getMovementRange,
  hireUnit,
  moveUnitTo,
  occupyUnit,
  supply,
} from "../state";
import { FactionId, TileType, Unit, UnitType } from "../types";
import { hireableUnits, unitCatalog } from "../unitCatalog";

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx <= 1 && dy <= 1 && (dx + dy) > 0;
};

const findAdjacentEnemy = (state: GameState, unit: Unit): Unit | null => {
  for (const other of state.units) {
    if (other.faction === unit.faction) {
      continue;
    }
    if (isAdjacent(unit.x, unit.y, other.x, other.y)) {
      return other;
    }
  }
  return null;
};

const getTile = (state: GameState, x: number, y: number) => {
  return state.map.tiles[getTileIndex(x, y, state.map.width)];
};

const getTargetPoints = (state: GameState, unit: Unit): Array<{ x: number; y: number; priority: number }> => {
  const targets: Array<{ x: number; y: number; priority: number }> = [];
  for (const other of state.units) {
    if (other.faction !== unit.faction) {
      targets.push({ x: other.x, y: other.y, priority: 0 });
    }
  }

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = getTile(state, x, y);
      if (tile.type !== TileType.Town && tile.type !== TileType.Castle) {
        continue;
      }
      if (tile.ownerFaction === unit.faction) {
        continue;
      }
      const priority = tile.ownerFaction === null || tile.ownerFaction === undefined ? 2 : 1;
      targets.push({ x, y, priority });
    }
  }

  return targets;
};

const pickMoveTarget = (state: GameState, unit: Unit): { x: number; y: number } | null => {
  const range = getMovementRange(state, unit);
  const targets = getTargetPoints(state, unit);
  if (targets.length === 0) {
    return null;
  }

  let best: { x: number; y: number; score: number } | null = null;

  for (const index of range.reachable) {
    const x = index % state.map.width;
    const y = Math.floor(index / state.map.width);
    if (x === unit.x && y === unit.y) {
      continue;
    }

    let score = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      const distance = Math.abs(x - target.x) + Math.abs(y - target.y);
      const candidate = distance * 10 + target.priority;
      if (candidate < score) {
        score = candidate;
      }
    }

    const tile = getTile(state, x, y);
    if (canOccupy(unit, tile)) {
      score -= 3;
    }
    if (findAdjacentEnemy(state, { ...unit, x, y })) {
      score -= 2;
    }

    if (!best || score < best.score) {
      best = { x, y, score };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
};

const trySupply = (state: GameState, unitId: number): boolean => {
  const unitIndex = state.units.findIndex((entry) => entry.id === unitId);
  if (unitIndex === -1) {
    return false;
  }
  const unit = state.units[unitIndex];
  if (unit.acted) {
    return false;
  }
  if (unit.hp >= unit.maxHp && unit.food >= unit.maxFood) {
    return false;
  }
  const tile = getTile(state, unit.x, unit.y);
  if (!canSupply(unit, tile, unit.faction)) {
    return false;
  }

  const result = supply(unit, state.budgets[unit.faction], {
    costFoodPer1: state.costFoodPer1,
    costHpPer1: state.costHpPer1,
  });
  if (result.spent === 0) {
    return false;
  }

  state.budgets[unit.faction] = result.budget;
  state.units[unitIndex] = result.unit;
  state.units[unitIndex].acted = true;
  return true;
};

const addHireStep = (state: GameState): { hired: boolean; kingId?: number } => {
  const actingFaction = state.turn.currentFaction;
  const factionName = state.factions.find((faction) => faction.id === actingFaction)?.name ?? "Unknown";
  if (state.cpuHireRemaining <= 0) {
    return { hired: false };
  }
  const kings = state.units.filter((unit) => unit.faction === actingFaction && unit.type === UnitType.King);
  if (kings.length === 0) {
    console.debug("CPU Hire: no king for faction", actingFaction);
    return { hired: false };
  }

  const castleKings = kings.filter((king) => canHireAtCastle(state, king));
  if (castleKings.length === 0) {
    console.debug("CPU Hire: no king on castle", actingFaction);
    return { hired: false };
  }

  const budget = state.budgets[actingFaction] ?? 0;
  let chosen: UnitType | null = null;
  let chosenCost = Number.POSITIVE_INFINITY;
  for (const unitType of hireableUnits) {
    const entry = unitCatalog[unitType];
    if (!entry || entry.hireCost > budget) {
      continue;
    }
    if (entry.hireCost < chosenCost) {
      chosen = unitType;
      chosenCost = entry.hireCost;
    }
  }

  if (!chosen || chosenCost === Number.POSITIVE_INFINITY) {
    console.debug("CPU Hire: insufficient budget", { faction: actingFaction, budget });
    return { hired: false };
  }

  for (const king of castleKings) {
    const spawn = getHireSpawnPosition(state, king);
    if (!spawn) {
      console.debug("CPU Hire: no spawn position", { faction: actingFaction, kingId: king.id });
      continue;
    }
    const hired = hireUnit(state, king.id, chosen);
    if (hired) {
      state.cpuHireRemaining = Math.max(0, state.cpuHireRemaining - 1);
      console.log(`CPU Hire: ${factionName} hired ${chosen} cost=${chosenCost}`);
      return { hired: true, kingId: king.id };
    }
  }

  console.debug("CPU Hire: hire failed", { faction: actingFaction, unitType: chosen });
  return { hired: false };
};

type CpuStepOptions = {
  factionId?: FactionId;
  skipUnit?: (unit: Unit) => boolean;
  allowEndTurn?: boolean;
};

export const runCpuTurnStep = (
  state: GameState,
  options?: CpuStepOptions,
): { acted: boolean; focusUnitId?: number; turnEnded?: boolean } => {
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;

  const actingFaction = options?.factionId ?? state.turn.currentFaction;
  const units = state.units.filter((unit) => unit.faction === actingFaction);

  for (const unit of units) {
    if (unit.acted || options?.skipUnit?.(unit)) {
      continue;
    }

    const adjacentEnemy = findAdjacentEnemy(state, unit);
    if (adjacentEnemy) {
      attackUnit(state, unit.id, adjacentEnemy.id);
      return { acted: true, focusUnitId: unit.id };
    }

    const tile = getTile(state, unit.x, unit.y);
    if (canOccupy(unit, tile)) {
      occupyUnit(state, unit.id);
      return { acted: true, focusUnitId: unit.id };
    }

    const hireResult = addHireStep(state);
    if (hireResult.hired) {
      return { acted: true, focusUnitId: hireResult.kingId };
    }

    if (trySupply(state, unit.id)) {
      return { acted: true, focusUnitId: unit.id };
    }

    if (unit.food <= 0 || unit.movedThisTurn) {
      unit.acted = true;
      return { acted: true, focusUnitId: unit.id };
    }

    const target = pickMoveTarget(state, unit);
    if (!target) {
      unit.acted = true;
      return { acted: true, focusUnitId: unit.id };
    }

    const moved = moveUnitTo(state, unit.id, target.x, target.y);
    if (!moved) {
      unit.acted = true;
      return { acted: true, focusUnitId: unit.id };
    }

    const movedUnit = state.units.find((entry) => entry.id === unit.id);
    if (!movedUnit || movedUnit.acted) {
      return { acted: true, focusUnitId: unit.id };
    }

    const enemyAfterMove = findAdjacentEnemy(state, movedUnit);
    if (enemyAfterMove) {
      attackUnit(state, movedUnit.id, enemyAfterMove.id);
      return { acted: true, focusUnitId: movedUnit.id };
    }

    const movedTile = getTile(state, movedUnit.x, movedUnit.y);
    if (canOccupy(movedUnit, movedTile)) {
      occupyUnit(state, movedUnit.id);
      return { acted: true, focusUnitId: movedUnit.id };
    }

    movedUnit.acted = true;
    return { acted: true, focusUnitId: movedUnit.id };
  }

  if (options?.allowEndTurn === false) {
    return { acted: false };
  }

  endTurn(state);
  return { acted: false, turnEnded: true };
};
