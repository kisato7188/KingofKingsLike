import { getTileIndex } from "../geometry";
import { attackUnit, canOccupy, canSupply, endTurn, GameState, getMovementRange, moveUnitTo, occupyUnit, supply } from "../state";
import { TileType, Unit } from "../types";

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

export const runCpuTurn = (state: GameState): void => {
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;

  const actingFaction = state.turn.currentFaction;
  const unitIds = state.units
    .filter((unit) => unit.faction === actingFaction)
    .map((unit) => unit.id);

  for (const unitId of unitIds) {
    const unit = state.units.find((entry) => entry.id === unitId);
    if (!unit || unit.acted) {
      continue;
    }

    const adjacentEnemy = findAdjacentEnemy(state, unit);
    if (adjacentEnemy) {
      attackUnit(state, unit.id, adjacentEnemy.id);
      continue;
    }

    const tile = getTile(state, unit.x, unit.y);
    if (canOccupy(unit, tile)) {
      occupyUnit(state, unit.id);
      continue;
    }

    if (trySupply(state, unit.id)) {
      continue;
    }

    if (unit.food <= 0) {
      continue;
    }

    const target = pickMoveTarget(state, unit);
    if (!target) {
      continue;
    }

    moveUnitTo(state, unit.id, target.x, target.y);
    const moved = state.units.find((entry) => entry.id === unit.id);
    if (!moved || moved.acted) {
      continue;
    }

    const enemyAfterMove = findAdjacentEnemy(state, moved);
    if (enemyAfterMove) {
      attackUnit(state, moved.id, enemyAfterMove.id);
      continue;
    }

    const movedTile = getTile(state, moved.x, moved.y);
    if (canOccupy(moved, movedTile)) {
      occupyUnit(state, moved.id);
    }
  }

  endTurn(state);
};
