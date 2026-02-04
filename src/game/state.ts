import { Input } from "./Input";
import { sampleScenario } from "../scenarios/sampleScenario";
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
    if (state.selectedUnitId === null) {
      const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
      if (unit && unit.faction === state.turn.currentFaction && !unit.acted) {
        state.selectedUnitId = unit.id;
        state.movementRange = unit.food > 0 ? calculateMovementRange(state, unit) : null;
      }
    } else {
      tryMoveSelectedUnit(state, state.cursor.x, state.cursor.y);
    }
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    state.selectedUnitId = null;
    state.movementRange = null;
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
  startTurn(state);
};

export const getUnitAt = (state: GameState, x: number, y: number): Unit | undefined => {
  return state.units.find((unit) => unit.x === x && unit.y === y);
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const calculateMovementRange = (state: GameState, unit: Unit): ReachableResult => {
  return findReachableTiles({
    width: state.map.width,
    height: state.map.height,
    startX: unit.x,
    startY: unit.y,
    maxCost: unit.movePoints,
    maxSteps: unit.food,
    toIndex: (x, y) => getTileIndex(x, y, state.map.width),
    isPassable: (x, y) => !isOccupied(state, x, y, unit.id),
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
};

const isOccupied = (state: GameState, x: number, y: number, ignoreId?: number): boolean => {
  return state.units.some((unit) => unit.id !== ignoreId && unit.x === x && unit.y === y);
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
