import { Input } from "./Input";
import { sampleScenario } from "../scenarios/sampleScenario";
import { battle } from "./battle";
import { findReachableTiles, ReachableResult } from "./pathfinding";
import { getTileIndex } from "./geometry";
import { Faction, FactionId, Scenario, TileType, Unit } from "./types";

export type GameState = {
  scenario: Scenario;
  cursor: {
    x: number;
    y: number;
  };
  turn: {
    factionIndex: number;
    currentFaction: FactionId;
    roundCount: number;
  };
  factions: Faction[];
  map: Scenario["map"];
  units: Unit[];
  selectedUnitId: number | null;
  movementRange: ReachableResult | null;
  attackMode: boolean;
};

export const createInitialState = (): GameState => {
  const scenario = sampleScenario;
  const initialFaction = scenario.factions[0]?.id ?? FactionId.Blue;
  const initialState: GameState = {
    scenario,
    cursor: { x: 0, y: 0 },
    turn: {
      factionIndex: 0,
      currentFaction: initialFaction,
      roundCount: 1,
    },
    factions: scenario.factions,
    map: scenario.map,
    units: scenario.units,
    selectedUnitId: null,
    movementRange: null,
    attackMode: false,
  };
  startTurn(initialState);
  return initialState;
};

export const updateState = (state: GameState, input: Input): void => {
  let deltaX = 0;
  let deltaY = 0;

  if (input.isPressed("ArrowUp")) deltaY -= 1;
  if (input.isPressed("ArrowDown")) deltaY += 1;
  if (input.isPressed("ArrowLeft")) deltaX -= 1;
  if (input.isPressed("ArrowRight")) deltaX += 1;

  if (deltaX !== 0 || deltaY !== 0) {
    state.cursor.x = clamp(state.cursor.x + deltaX, 0, state.map.width - 1);
    state.cursor.y = clamp(state.cursor.y + deltaY, 0, state.map.height - 1);
  }

  if (input.isPressed("KeyE")) {
    endTurn(state);
  }

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    if (state.attackMode) {
      tryAttackAtCursor(state);
    } else if (state.selectedUnitId === null) {
      const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
      if (unit && unit.faction === state.turn.currentFaction && !unit.acted) {
        state.selectedUnitId = unit.id;
        state.movementRange = unit.food > 0 ? calculateMovementRange(state, unit) : null;
      }
    } else {
      tryMoveSelectedUnit(state, state.cursor.x, state.cursor.y);
    }
  }

  if (input.isPressed("KeyA")) {
    if (state.selectedUnitId !== null && hasAdjacentEnemy(state, state.selectedUnitId)) {
      state.attackMode = true;
      state.movementRange = null;
    }
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    if (state.attackMode) {
      state.attackMode = false;
      const unit = state.selectedUnitId !== null
        ? state.units.find((entry) => entry.id === state.selectedUnitId)
        : undefined;
      state.movementRange = unit && unit.food > 0 ? calculateMovementRange(state, unit) : null;
    } else {
      state.selectedUnitId = null;
      state.movementRange = null;
    }
  }
};

const startTurn = (state: GameState): void => {
  for (const unit of state.units) {
    if (unit.faction === state.turn.currentFaction) {
      unit.acted = false;
    }
  }
  const factionName = state.factions.find((faction) => faction.id === state.turn.currentFaction)?.name ?? "Unknown";
  console.debug(`Turn Start: ${factionName}`);
};

const endTurn = (state: GameState): void => {
  const nextIndex = (state.turn.factionIndex + 1) % state.factions.length;
  const nextFaction = state.factions[nextIndex]?.id ?? state.turn.currentFaction;
  const wrapped = nextIndex === 0 && state.turn.factionIndex !== 0;

  state.turn.factionIndex = nextIndex;
  state.turn.currentFaction = nextFaction;
  if (wrapped) {
    state.turn.roundCount += 1;
  }
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  startTurn(state);
};

export const getUnitAt = (state: GameState, x: number, y: number): Unit | undefined => {
  return state.units.find((unit) => unit.x === x && unit.y === y);
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const calculateMovementRange = (state: GameState, unit: Unit): ReachableResult => {
  const enemyZoc = getEnemyZocTiles(state.units, unit.faction, state.map.width, state.map.height);
  return findReachableTiles({
    width: state.map.width,
    height: state.map.height,
    startX: unit.x,
    startY: unit.y,
    maxCost: unit.movePoints,
    maxSteps: unit.food,
    toIndex: (x, y) => getTileIndex(x, y, state.map.width),
    isPassable: (x, y) => !isOccupied(state, x, y, unit.id),
    shouldStopAt: (x, y) => isBlockedByZoc(enemyZoc, x, y, unit, state.map.width),
    getMoveCost: (x, y) => getMoveCostForTile(state, x, y),
  });
};

const tryMoveSelectedUnit = (state: GameState, targetX: number, targetY: number): void => {
  if (!state.movementRange || state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }

  if (isOccupied(state, targetX, targetY, unit.id)) {
    return;
  }

  const targetIndex = getTileIndex(targetX, targetY, state.map.width);
  if (!state.movementRange.reachable.has(targetIndex)) {
    return;
  }

  const steps = state.movementRange.steps.get(targetIndex);
  if (steps === undefined || steps <= 0 || steps > unit.food) {
    return;
  }

  if (unit.x === targetX && unit.y === targetY) {
    return;
  }

  unit.x = targetX;
  unit.y = targetY;
  unit.food = Math.max(0, unit.food - steps);
  unit.acted = true;
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
};

const tryAttackAtCursor = (state: GameState): void => {
  if (state.selectedUnitId === null) {
    return;
  }

  const attackerIndex = state.units.findIndex((entry) => entry.id === state.selectedUnitId);
  if (attackerIndex === -1) {
    return;
  }

  const attacker = state.units[attackerIndex];
  const defenderIndex = state.units.findIndex((unit) =>
    unit.id !== attacker.id &&
    unit.faction !== attacker.faction &&
    unit.x === state.cursor.x &&
    unit.y === state.cursor.y &&
    isAdjacent(attacker.x, attacker.y, unit.x, unit.y),
  );

  if (defenderIndex === -1) {
    return;
  }

  const defender = state.units[defenderIndex];
  const result = battle(attacker, defender, state.map);
  for (const line of result.log) {
    console.log(line);
  }

  if (result.attackerDefeated) {
    state.units.splice(attackerIndex, 1);
  } else {
    state.units[attackerIndex] = { ...result.attacker, acted: true };
  }

  if (result.defenderDefeated) {
    const currentIndex = state.units.findIndex((unit) => unit.id === defender.id);
    if (currentIndex !== -1) {
      state.units.splice(currentIndex, 1);
    }
  } else {
    const currentIndex = state.units.findIndex((unit) => unit.id === defender.id);
    if (currentIndex !== -1) {
      state.units[currentIndex] = result.defender;
    }
  }

  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
};

const isOccupied = (state: GameState, x: number, y: number, ignoreId?: number): boolean => {
  return state.units.some((unit) => unit.id !== ignoreId && unit.x === x && unit.y === y);
};

const hasAdjacentEnemy = (state: GameState, unitId: number): boolean => {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit) {
    return false;
  }
  return state.units.some((other) =>
    other.faction !== unit.faction && isAdjacent(unit.x, unit.y, other.x, other.y),
  );
};

const isAdjacent = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx <= 1 && dy <= 1 && (dx + dy) > 0;
};

export const getEnemyZocTiles = (
  units: Unit[],
  actingFaction: FactionId,
  width: number,
  height: number,
): Set<number> => {
  const zoc = new Set<number>();
  for (const unit of units) {
    if (unit.faction === actingFaction) {
      continue;
    }

    const neighbors = [
      { x: unit.x + 1, y: unit.y },
      { x: unit.x - 1, y: unit.y },
      { x: unit.x, y: unit.y + 1 },
      { x: unit.x, y: unit.y - 1 },
    ];

    for (const pos of neighbors) {
      if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) {
        continue;
      }
      zoc.add(getTileIndex(pos.x, pos.y, width));
    }
  }
  return zoc;
};

const isBlockedByZoc = (zoc: Set<number>, x: number, y: number, unit: Unit, width: number): boolean => {
  if (x === unit.x && y === unit.y) {
    return false;
  }
  return zoc.has(getTileIndex(x, y, width));
};

const getMoveCostForTile = (state: GameState, x: number, y: number): number => {
  const tile = state.map.tiles[getTileIndex(x, y, state.map.width)];
  switch (tile.type) {
    case TileType.Forest:
      return 2;
    case TileType.Mountain:
      return 3;
    case TileType.Road:
    case TileType.Town:
    case TileType.Castle:
    case TileType.Grass:
    default:
      return 1;
  }
};
