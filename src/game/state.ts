import { Input } from "./Input";
import { GameConfig, createDefaultConfig } from "./config";
import { sampleScenario } from "../scenarios/sampleScenario";
import { battle, defaultBattleConfig, getExpMultiplier } from "./battle";
import { findReachableTiles, ReachableResult } from "./pathfinding";
import { getTileIndex } from "./geometry";
import { hireableUnits, unitCatalog } from "./unitCatalog";
import { Spell, spells } from "./spells";
import { Faction, FactionId, Scenario, TileType, Unit, UnitType } from "./types";

export type GameState = {
  scenario: Scenario;
  config: GameConfig;
  cursor: {
    x: number;
    y: number;
  };
  cpuHireRemaining: number;
  uiEffects: UiEffect[];
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
  actionMenuOpen: boolean;
  actionMenuIndex: number;
  movementPaths: Map<number, Array<{ x: number; y: number }>>;
  contextMenuOpen: boolean;
  contextMenuIndex: number;
  contextMenuAnchor: { x: number; y: number } | null;
  hirePlacementMode: boolean;
  hirePlacementUnitType: UnitType | null;
  hirePlacementOriginId: number | null;
  hireMenuOpen: boolean;
  hireSelectionIndex: number;
  hireConsumesAction: boolean;
  magicMode: boolean;
  magicSpellIndex: number;
  magicError: string | null;
  nextUnitId: number;
  costFoodPer1: number;
  costHpPer1: number;
  baseExpPerKill: number;
  expThresholds: number[];
  expAffinity: Partial<Record<UnitType, Partial<Record<UnitType, number>>>>;
  levelBonusAttack: number;
  applyDefenderLevelBonus: boolean;
  budgets: Record<FactionId, number>;
  baseIncome: number;
  incomePerTown: number;
  incomePerCastle: number;
};

export type UiEffect =
  | { kind: "turn"; label: string }
  | {
      kind: "attack";
      attackerType: UnitType;
      defenderType: UnitType;
      attackerFaction: FactionId;
      defenderFaction: FactionId;
    }
  | { kind: "occupy"; label: string };

export const createInitialState = (): GameState => {
  const scenario = sampleScenario;
  const initialFaction = getFirstActiveFaction(scenario);
  const initialState: GameState = {
    scenario,
    config: createDefaultConfig(),
    cursor: { x: 0, y: 0 },
    cpuHireRemaining: 1,
    uiEffects: [],
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
    actionMenuOpen: false,
    actionMenuIndex: 0,
    movementPaths: new Map<number, Array<{ x: number; y: number }>>(),
    contextMenuOpen: false,
    contextMenuIndex: 0,
    contextMenuAnchor: null,
    hirePlacementMode: false,
    hirePlacementUnitType: null,
    hirePlacementOriginId: null,
    hireMenuOpen: false,
    hireSelectionIndex: 0,
    hireConsumesAction: false,
    magicMode: false,
    magicSpellIndex: 0,
    magicError: null,
    nextUnitId: Math.max(0, ...scenario.units.map((unit) => unit.id)) + 1,
    costFoodPer1: 2,
    costHpPer1: 5,
    baseExpPerKill: 20,
    expThresholds: [10, 25, 45, 70, 100, 135, 175, 220],
    expAffinity: {},
    levelBonusAttack: 1,
    applyDefenderLevelBonus: false,
    budgets: {
      [FactionId.Blue]: 0,
      [FactionId.Red]: 0,
      [FactionId.Yellow]: 0,
      [FactionId.Green]: 0,
    },
    baseIncome: 100,
    incomePerTown: 20,
    incomePerCastle: 50,
  };
  startTurn(initialState);
  return initialState;
};

export const updateState = (state: GameState, input: Input, allowHumanActions = true): void => {
  state.magicError = null;
  handleControllerToggle(state, input);

  if (!allowHumanActions) {
    return;
  }

  if (state.hireMenuOpen) {
    handleHireMenuInput(state, input);
    return;
  }

  if (state.actionMenuOpen) {
    handleActionMenuInput(state, input);
    return;
  }

  if (state.hirePlacementMode) {
    handleHirePlacementInput(state, input);
    return;
  }

  if (state.contextMenuOpen) {
    return;
  }

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
    if (state.magicMode) {
      tryCastSpellAtCursor(state);
    } else if (state.attackMode) {
      tryAttackAtCursor(state);
    } else if (state.selectedUnitId === null) {
      const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
      if (unit && unit.faction === state.turn.currentFaction && (!unit.acted || canHireAtCastle(state, unit))) {
        openActionMenu(state, unit);
      }
    } else {
      tryMoveSelectedUnit(state, state.cursor.x, state.cursor.y);
    }
  }

  if (input.isPressed("KeyO")) {
    tryOccupyAtCursor(state);
  }

  if (input.isPressed("KeyS")) {
    trySupplyAtCursor(state);
  }

  if (input.isPressed("KeyM")) {
    const unit = state.selectedUnitId !== null
      ? state.units.find((entry) => entry.id === state.selectedUnitId)
      : undefined;
    if (unit && isCaster(unit)) {
      state.magicMode = true;
      state.movementRange = null;
      state.attackMode = false;
      state.hireMenuOpen = false;
    }
  }

  if (input.isPressed("KeyH")) {
    const unit = state.selectedUnitId !== null
      ? state.units.find((entry) => entry.id === state.selectedUnitId)
      : undefined;
    if (unit && canHireAtCastle(state, unit)) {
      state.hireMenuOpen = true;
      state.hireSelectionIndex = 0;
      state.movementRange = null;
      state.attackMode = false;
    }
  }

  if (input.isPressed("KeyA")) {
    if (state.selectedUnitId !== null && hasAdjacentEnemy(state, state.selectedUnitId)) {
      state.attackMode = true;
      state.movementRange = null;
    }
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    if (state.actionMenuOpen) {
      state.actionMenuOpen = false;
    } else if (state.magicMode) {
      state.magicMode = false;
      const unit = state.selectedUnitId !== null
        ? state.units.find((entry) => entry.id === state.selectedUnitId)
        : undefined;
      state.movementRange = unit && unit.food > 0 && !unit.movedThisTurn ? getMovementRange(state, unit) : null;
    } else if (state.attackMode) {
      state.attackMode = false;
      const unit = state.selectedUnitId !== null
        ? state.units.find((entry) => entry.id === state.selectedUnitId)
        : undefined;
      state.movementRange = unit && unit.food > 0 && !unit.movedThisTurn ? getMovementRange(state, unit) : null;
    } else {
      state.selectedUnitId = null;
      state.movementRange = null;
    }
  }
};

export const handleTileClick = (state: GameState, x: number, y: number): void => {
  state.cursor.x = clamp(x, 0, state.map.width - 1);
  state.cursor.y = clamp(y, 0, state.map.height - 1);

  if (state.actionMenuOpen) {
    return;
  }

  if (state.hireMenuOpen) {
    return;
  }

  if (state.hirePlacementMode) {
    tryPlaceHiredUnitAt(state, state.cursor.x, state.cursor.y);
    return;
  }

  if (state.hirePlacementMode) {
    return;
  }

  if (state.contextMenuOpen) {
    return;
  }

  if (state.magicMode) {
    tryCastSpellAtCursor(state);
    return;
  }

  if (state.attackMode) {
    tryAttackAtCursor(state);
    return;
  }

  if (state.selectedUnitId === null) {
    const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
    if (unit && unit.faction === state.turn.currentFaction && (!unit.acted || canHireAtCastle(state, unit))) {
      openActionMenu(state, unit);
    }
    return;
  }

  tryMoveSelectedUnit(state, state.cursor.x, state.cursor.y);
};

export const clearSelection = (state: GameState): void => {
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.actionMenuOpen = false;
  state.contextMenuOpen = false;
  state.contextMenuAnchor = null;
  state.hirePlacementMode = false;
  state.hirePlacementUnitType = null;
  state.hirePlacementOriginId = null;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

const startTurn = (state: GameState): void => {
  for (const unit of state.units) {
    if (unit.faction === state.turn.currentFaction) {
      unit.acted = false;
      unit.movedThisTurn = false;
    }
  }
  state.cpuHireRemaining = 1;
  const income = calcIncome(state.turn.currentFaction, state.map, state.baseIncome, state.incomePerTown, state.incomePerCastle);
  state.budgets[state.turn.currentFaction] += income.total;
  console.log(
    `Income: base ${income.base} + towns ${income.towns}*${state.incomePerTown} + castles ${income.castles}*${state.incomePerCastle} = ${income.total}`,
  );
  const factionName = state.factions.find((faction) => faction.id === state.turn.currentFaction)?.name ?? "Unknown";
  console.debug(`Turn Start: ${factionName}`);
};

export const endTurn = (state: GameState): void => {
  const { nextIndex, nextFaction, wrapped } = getNextActiveFaction(state);

  state.turn.factionIndex = nextIndex;
  state.turn.currentFaction = nextFaction;
  if (wrapped) {
    state.turn.roundCount += 1;
  }
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.actionMenuOpen = false;
  state.contextMenuOpen = false;
  state.contextMenuAnchor = null;
  state.hirePlacementMode = false;
  state.hirePlacementUnitType = null;
  state.hirePlacementOriginId = null;
  state.hireMenuOpen = false;
  state.magicMode = false;
  startTurn(state);

  const controller = state.config.controllers[state.turn.currentFaction] ?? "Human";
  const label = controller === "Human" ? "Player Turn" : "Enemy Turn";
  state.uiEffects.push({ kind: "turn", label });
};

export const getUnitAt = (state: GameState, x: number, y: number): Unit | undefined => {
  return state.units.find((unit) => unit.x === x && unit.y === y);
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const getMovementRange = (state: GameState, unit: Unit): ReachableResult => {
  const enemyZoc = getEnemyZocTiles(state.units, unit.faction, state.map.width, state.map.height);
  const result = findReachableTiles({
    width: state.map.width,
    height: state.map.height,
    startX: unit.x,
    startY: unit.y,
    maxCost: unit.movePoints,
    maxSteps: unit.food,
    toIndex: (x, y) => getTileIndex(x, y, state.map.width),
    isPassable: (x, y) => !isOccupiedByEnemy(state, x, y, unit),
    shouldStopAt: (x, y) => isBlockedByZoc(enemyZoc, x, y, unit, state.map.width),
    getMoveCost: (x, y) => getMoveCostForTile(state, x, y),
  });
  for (const other of state.units) {
    if (other.id === unit.id || other.faction !== unit.faction) {
      continue;
    }
    result.reachable.delete(getTileIndex(other.x, other.y, state.map.width));
  }
  return result;
};

const buildMovePath = (
  state: GameState,
  unit: Unit,
  targetX: number,
  targetY: number,
  range: ReachableResult,
): Array<{ x: number; y: number }> | null => {
  const startX = unit.x;
  const startY = unit.y;
  if (startX === targetX && startY === targetY) {
    return [{ x: startX, y: startY }];
  }

  const width = state.map.width;
  const targetIndex = getTileIndex(targetX, targetY, width);
  const targetSteps = range.steps.get(targetIndex);
  const targetCost = range.costs.get(targetIndex);
  if (targetSteps === undefined || targetCost === undefined) {
    return null;
  }

  const path: Array<{ x: number; y: number }> = [{ x: targetX, y: targetY }];
  let currentX = targetX;
  let currentY = targetY;
  let currentSteps = targetSteps;
  let currentCost = targetCost;
  const visited = new Set<number>();

  while (!(currentX === startX && currentY === startY)) {
    const currentIndex = getTileIndex(currentX, currentY, width);
    if (visited.has(currentIndex)) {
      return null;
    }
    visited.add(currentIndex);

    const neighbors = [
      { x: currentX + 1, y: currentY },
      { x: currentX - 1, y: currentY },
      { x: currentX, y: currentY + 1 },
      { x: currentX, y: currentY - 1 },
    ];

    const stepCost = getMoveCostForTile(state, currentX, currentY);
    let found = false;

    for (const next of neighbors) {
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= state.map.height) {
        continue;
      }
      const nextIndex = getTileIndex(next.x, next.y, width);
      const nextSteps = range.steps.get(nextIndex);
      const nextCost = range.costs.get(nextIndex);
      if (nextSteps === undefined || nextCost === undefined) {
        continue;
      }
      if (nextSteps !== currentSteps - 1) {
        continue;
      }
      if (nextCost + stepCost !== currentCost) {
        continue;
      }

      path.push({ x: next.x, y: next.y });
      currentX = next.x;
      currentY = next.y;
      currentSteps = nextSteps;
      currentCost = nextCost;
      found = true;
      break;
    }

    if (!found) {
      return null;
    }
  }

  return path.reverse();
};

const tryMoveSelectedUnit = (state: GameState, targetX: number, targetY: number): void => {
  if (!state.movementRange || state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }
  if (unit.movedThisTurn) {
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

  const path = buildMovePath(state, unit, targetX, targetY, state.movementRange);
  if (path) {
    state.movementPaths.set(unit.id, path);
  }

  unit.x = targetX;
  unit.y = targetY;
  unit.food = Math.max(0, unit.food - steps);
  unit.movedThisTurn = true;
  const occupied = occupyIfPossible(state, unit);
  if (occupied) {
    unit.acted = true;
  }
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

export const moveUnitTo = (state: GameState, unitId: number, targetX: number, targetY: number): boolean => {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit || unit.acted) {
    return false;
  }
  if (unit.movedThisTurn) {
    return false;
  }
  if (isOccupied(state, targetX, targetY, unit.id)) {
    return false;
  }
  const range = getMovementRange(state, unit);
  const targetIndex = getTileIndex(targetX, targetY, state.map.width);
  if (!range.reachable.has(targetIndex)) {
    return false;
  }
  const steps = range.steps.get(targetIndex);
  if (steps === undefined || steps <= 0 || steps > unit.food) {
    return false;
  }
  if (unit.x === targetX && unit.y === targetY) {
    return false;
  }
  const path = buildMovePath(state, unit, targetX, targetY, range);
  if (path) {
    state.movementPaths.set(unit.id, path);
  }
  unit.x = targetX;
  unit.y = targetY;
  unit.food = Math.max(0, unit.food - steps);
  unit.movedThisTurn = true;
  const occupied = occupyIfPossible(state, unit);
  if (occupied) {
    unit.acted = true;
  }
  return true;
};

const getFirstActiveFaction = (scenario: Scenario): FactionId => {
  for (const faction of scenario.factions) {
    if (scenario.units.some((unit) => unit.faction === faction.id)) {
      return faction.id;
    }
  }
  return scenario.factions[0]?.id ?? FactionId.Blue;
};

const getNextActiveFaction = (state: GameState): { nextIndex: number; nextFaction: FactionId; wrapped: boolean } => {
  if (state.factions.length === 0) {
    return { nextIndex: 0, nextFaction: state.turn.currentFaction, wrapped: false };
  }

  let index = state.turn.factionIndex;
  let wrapped = false;

  for (let i = 0; i < state.factions.length; i += 1) {
    index = (index + 1) % state.factions.length;
    if (index === 0) {
      wrapped = true;
    }
    const factionId = state.factions[index]?.id;
    if (factionId !== undefined && state.units.some((unit) => unit.faction === factionId)) {
      return { nextIndex: index, nextFaction: factionId, wrapped };
    }
  }

  return { nextIndex: state.turn.factionIndex, nextFaction: state.turn.currentFaction, wrapped: false };
};

const tryOccupyAtCursor = (state: GameState): void => {
  if (state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit || unit.acted) {
    return;
  }

  if (unit.x !== state.cursor.x || unit.y !== state.cursor.y) {
    return;
  }

  if (!occupyIfPossible(state, unit)) {
    return;
  }

  unit.acted = true;
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

export const occupyUnit = (state: GameState, unitId: number): boolean => {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit || unit.acted) {
    return false;
  }
  if (!occupyIfPossible(state, unit)) {
    return false;
  }
  unit.acted = true;
  return true;
};

const trySupplyAtCursor = (state: GameState): void => {
  if (state.selectedUnitId === null) {
    return;
  }

  const unitIndex = state.units.findIndex((entry) => entry.id === state.selectedUnitId);
  if (unitIndex === -1) {
    return;
  }

  const unit = state.units[unitIndex];
  if (unit.acted) {
    return;
  }

  if (unit.x !== state.cursor.x || unit.y !== state.cursor.y) {
    return;
  }

  const tile = state.map.tiles[getTileIndex(unit.x, unit.y, state.map.width)];
  if (!canSupply(unit, tile, unit.faction)) {
    return;
  }

  const result = supply(unit, state.budgets[unit.faction], {
    costFoodPer1: state.costFoodPer1,
    costHpPer1: state.costHpPer1,
  });
  if (result.spent === 0) {
    return;
  }

  state.budgets[unit.faction] = result.budget;
  state.units[unitIndex] = result.unit;
  state.units[unitIndex].acted = true;
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
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

  resolveBattle(state, attackerIndex, defenderIndex);
  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

export const attackUnit = (state: GameState, attackerId: number, defenderId: number): boolean => {
  const attackerIndex = state.units.findIndex((entry) => entry.id === attackerId);
  const defenderIndex = state.units.findIndex((entry) => entry.id === defenderId);
  if (attackerIndex === -1 || defenderIndex === -1) {
    return false;
  }
  const attacker = state.units[attackerIndex];
  const defender = state.units[defenderIndex];
  if (attacker.acted || attacker.faction === defender.faction) {
    return false;
  }
  if (!isAdjacent(attacker.x, attacker.y, defender.x, defender.y)) {
    return false;
  }
  resolveBattle(state, attackerIndex, defenderIndex);
  return true;
};

const resolveBattle = (state: GameState, attackerIndex: number, defenderIndex: number): void => {
  const attacker = state.units[attackerIndex];
  const defender = state.units[defenderIndex];
  state.uiEffects.push({
    kind: "attack",
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerFaction: attacker.faction,
    defenderFaction: defender.faction,
  });
  const result = battle(attacker, defender, state.map, {
    ...defaultBattleConfig,
    levelBonusAttack: state.levelBonusAttack,
    applyDefenderLevelBonus: state.applyDefenderLevelBonus,
    affinityMultiplier: state.expAffinity,
  });
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

  if (result.defenderDefeated && !result.attackerDefeated) {
    const expGain = calcExpGain(state, attacker, defender);
    applyExperience(state, result.attacker.id, expGain);
  }
  if (result.attackerDefeated && !result.defenderDefeated) {
    const expGain = calcExpGain(state, defender, attacker);
    applyExperience(state, result.defender.id, expGain);
  }

  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

const isOccupied = (state: GameState, x: number, y: number, ignoreId?: number): boolean => {
  return state.units.some((unit) => unit.id !== ignoreId && unit.x === x && unit.y === y);
};

const isOccupiedByEnemy = (state: GameState, x: number, y: number, unit: Unit): boolean => {
  return state.units.some((other) => other.faction !== unit.faction && other.x === x && other.y === y);
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

export const canHireAtCastle = (state: GameState, unit: Unit): boolean => {
  if (unit.type !== UnitType.King) {
    return false;
  }
  const tile = state.map.tiles[getTileIndex(unit.x, unit.y, state.map.width)];
  return tile.type === TileType.Castle;
};

export const getHireSpawnPosition = (state: GameState, unit: Unit): { x: number; y: number } | null => {
  const offsets = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  for (const offset of offsets) {
    const x = unit.x + offset.x;
    const y = unit.y + offset.y;
    if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
      continue;
    }
    if (!isOccupied(state, x, y)) {
      return { x, y };
    }
  }

  return null;
};

export const canHireUnitType = (state: GameState, unit: Unit, unitType: UnitType): boolean => {
  const entry = unitCatalog[unitType];
  if (!entry) {
    return false;
  }
  if (!canHireAtCastle(state, unit)) {
    return false;
  }
  if (state.budgets[unit.faction] < entry.hireCost) {
    return false;
  }
  return getHireSpawnPosition(state, unit) !== null;
};

export const getHirePlacementPositions = (state: GameState, unit: Unit): Array<{ x: number; y: number }> => {
  const offsets = [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  const positions: Array<{ x: number; y: number }> = [];
  for (const offset of offsets) {
    const x = unit.x + offset.x;
    const y = unit.y + offset.y;
    if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) {
      continue;
    }
    if (!isOccupied(state, x, y)) {
      positions.push({ x, y });
    }
  }

  return positions;
};

export const hireUnit = (state: GameState, kingUnitId: number, unitType: UnitType): boolean => {
  const king = state.units.find((unit) => unit.id === kingUnitId);
  if (!king || !canHireAtCastle(state, king)) {
    return false;
  }

  const entry = unitCatalog[unitType];
  if (!entry) {
    return false;
  }
  if (state.budgets[king.faction] < entry.hireCost) {
    return false;
  }

  const spawn = getHireSpawnPosition(state, king);
  if (!spawn) {
    return false;
  }

  const hired = hireUnitAtPosition(state, king, unitType, spawn.x, spawn.y);
  if (!hired) {
    return false;
  }
  if (state.hireConsumesAction) {
    king.acted = true;
  }
  return true;
};

const hireUnitAtPosition = (state: GameState, king: Unit, unitType: UnitType, x: number, y: number): boolean => {
  const entry = unitCatalog[unitType];
  if (!entry) {
    return false;
  }
  if (state.budgets[king.faction] < entry.hireCost) {
    return false;
  }
  if (isOccupied(state, x, y)) {
    return false;
  }

  state.budgets[king.faction] -= entry.hireCost;
  state.units.push({
    id: state.nextUnitId,
    type: unitType,
    faction: king.faction,
    x,
    y,
    movePoints: entry.movePoints,
    food: entry.food,
    maxFood: entry.maxFood,
    movedThisTurn: false,
    acted: false,
    power: entry.power,
    defense: entry.defense,
    level: entry.level,
    exp: 0,
    crown: false,
    hp: entry.hp,
    maxHp: entry.maxHp,
  });
  state.nextUnitId += 1;
  return true;
};

const handleHireMenuInput = (state: GameState, input: Input): void => {
  const options = hireableUnits;
  if (options.length === 0) {
    state.hireMenuOpen = false;
    return;
  }

  if (input.isPressed("ArrowUp")) {
    state.hireSelectionIndex = (state.hireSelectionIndex - 1 + options.length) % options.length;
  }
  if (input.isPressed("ArrowDown")) {
    state.hireSelectionIndex = (state.hireSelectionIndex + 1) % options.length;
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace") || input.isPressed("KeyH")) {
    state.hireMenuOpen = false;
    const unit = state.selectedUnitId !== null
      ? state.units.find((entry) => entry.id === state.selectedUnitId)
      : undefined;
    state.movementRange = unit && unit.food > 0 ? getMovementRange(state, unit) : null;
    return;
  }

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    applyHireMenuSelection(state, state.hireSelectionIndex);
  }
};

const handleHirePlacementInput = (state: GameState, input: Input): void => {
  if (!state.hirePlacementMode) {
    return;
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    state.hirePlacementMode = false;
    state.hirePlacementUnitType = null;
    state.hirePlacementOriginId = null;
    return;
  }

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

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    tryPlaceHiredUnitAt(state, state.cursor.x, state.cursor.y);
  }
};

type ActionMenuKey = "Move" | "Attack" | "Magic" | "Hire";

type ActionMenuOption = {
  key: ActionMenuKey;
  label: string;
};

export const getActionMenuOptions = (state: GameState, unit: Unit): ActionMenuOption[] => {
  const options: ActionMenuOption[] = [];

  if (unit.acted) {
    if (canHireAtCastle(state, unit)) {
      options.push({ key: "Hire", label: "雇用" });
    }
    return options;
  }

  if (!unit.movedThisTurn && unit.food > 0) {
    options.push({ key: "Move", label: "移動" });
  }
  if (hasAdjacentEnemy(state, unit.id)) {
    options.push({ key: "Attack", label: "攻撃" });
  }
  if (isCaster(unit)) {
    options.push({ key: "Magic", label: "魔法" });
  }
  if (canHireAtCastle(state, unit)) {
    options.push({ key: "Hire", label: "雇用" });
  }

  return options;
};

const openActionMenu = (state: GameState, unit: Unit): void => {
  state.selectedUnitId = unit.id;
  state.movementRange = null;
  state.attackMode = false;
  state.magicMode = false;
  state.hireMenuOpen = false;
  state.actionMenuOpen = true;
  state.actionMenuIndex = 0;
};

const handleActionMenuInput = (state: GameState, input: Input): void => {
  if (state.selectedUnitId === null) {
    state.actionMenuOpen = false;
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    state.actionMenuOpen = false;
    return;
  }

  const options = getActionMenuOptions(state, unit);
  if (options.length === 0) {
    state.actionMenuOpen = false;
    return;
  }

  if (state.actionMenuIndex >= options.length) {
    state.actionMenuIndex = 0;
  }

  if (input.isPressed("ArrowUp")) {
    state.actionMenuIndex = (state.actionMenuIndex - 1 + options.length) % options.length;
  }
  if (input.isPressed("ArrowDown")) {
    state.actionMenuIndex = (state.actionMenuIndex + 1) % options.length;
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    state.actionMenuOpen = false;
    return;
  }

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    applyActionMenuSelection(state, state.actionMenuIndex);
  }
};

export const applyHireMenuSelection = (state: GameState, index: number): void => {
  const options = hireableUnits;
  if (!state.hireMenuOpen || options.length === 0) {
    return;
  }
  if (index < 0 || index >= options.length) {
    return;
  }

  state.hireSelectionIndex = index;
  const unitType = options[index];
  if (state.selectedUnitId === null) {
    return;
  }
  const king = state.units.find((unit) => unit.id === state.selectedUnitId);
  if (!king || !canHireAtCastle(state, king)) {
    return;
  }
  if (!canHireUnitType(state, king, unitType)) {
    return;
  }

  state.hireMenuOpen = false;
  state.hirePlacementMode = true;
  state.hirePlacementUnitType = unitType;
  state.hirePlacementOriginId = king.id;
};

export const applyActionMenuSelection = (state: GameState, index: number): void => {
  if (state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }

  const options = getActionMenuOptions(state, unit);
  if (options.length === 0 || index < 0 || index >= options.length) {
    return;
  }

  state.actionMenuIndex = index;
  const selected = options[index];
  if (!selected) {
    return;
  }

  state.actionMenuOpen = false;

  switch (selected.key) {
    case "Move":
      state.movementRange = getMovementRange(state, unit);
      break;
    case "Attack":
      state.attackMode = true;
      break;
    case "Magic":
      state.magicMode = true;
      break;
    case "Hire":
      state.hireMenuOpen = true;
      state.hireSelectionIndex = 0;
      break;
    default:
      break;
  }
};

export const openContextMenu = (state: GameState, anchor?: { x: number; y: number }): void => {
  state.contextMenuOpen = true;
  state.contextMenuIndex = 0;
  state.contextMenuAnchor = anchor ? { x: anchor.x, y: anchor.y } : { ...state.cursor };
  state.actionMenuOpen = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
  state.attackMode = false;
  state.movementRange = null;
};

export const applyContextMenuSelection = (state: GameState, index: number): void => {
  if (!state.contextMenuOpen) {
    return;
  }
  if (index !== 0) {
    return;
  }
  state.contextMenuOpen = false;
  state.contextMenuAnchor = null;
  endTurn(state);
};

const tryPlaceHiredUnitAt = (state: GameState, x: number, y: number): void => {
  if (!state.hirePlacementMode || state.hirePlacementUnitType === null || state.hirePlacementOriginId === null) {
    return;
  }

  const king = state.units.find((unit) => unit.id === state.hirePlacementOriginId);
  if (!king || !canHireAtCastle(state, king)) {
    return;
  }

  const options = getHirePlacementPositions(state, king);
  if (!options.some((pos) => pos.x === x && pos.y === y)) {
    return;
  }

  const hired = hireUnitAtPosition(state, king, state.hirePlacementUnitType, x, y);
  if (!hired) {
    return;
  }

  state.hirePlacementMode = false;
  state.hirePlacementUnitType = null;
  state.hirePlacementOriginId = null;
  state.movementRange = null;
  state.selectedUnitId = null;
  state.actionMenuOpen = false;
  state.attackMode = false;
  state.magicMode = false;
};

const handleControllerToggle = (state: GameState, input: Input): void => {
  const mapping: Array<[string, FactionId]> = [
    ["Digit1", FactionId.Blue],
    ["Digit2", FactionId.Red],
    ["Digit3", FactionId.Yellow],
    ["Digit4", FactionId.Green],
  ];
  for (const [code, factionId] of mapping) {
    if (input.isPressed(code)) {
      const current = state.config.controllers[factionId];
      state.config.controllers[factionId] = current === "Human" ? "CPU" : "Human";
    }
  }
};

const isCaster = (unit: Unit): boolean => {
  return unitCatalog[unit.type]?.isCaster ?? false;
};

const getSelectedSpell = (state: GameState): Spell | null => {
  return spells[state.magicSpellIndex] ?? null;
};

const tryCastSpellAtCursor = (state: GameState): void => {
  if (state.selectedUnitId === null) {
    return;
  }

  const casterIndex = state.units.findIndex((unit) => unit.id === state.selectedUnitId);
  if (casterIndex === -1) {
    return;
  }

  const caster = state.units[casterIndex];
  if (!isCaster(caster)) {
    return;
  }

  const spell = getSelectedSpell(state);
  if (!spell) {
    return;
  }

  const targetIndex = state.units.findIndex((unit) => unit.x === state.cursor.x && unit.y === state.cursor.y);
  if (targetIndex === -1) {
    return;
  }

  const target = state.units[targetIndex];
  if (!isValidSpellTarget(caster, target, spell)) {
    return;
  }

  const updatedTarget = spell.effect(caster, target);
  state.units[targetIndex] = updatedTarget;
  state.units[casterIndex].acted = true;
  console.log(`${caster.type} casts ${spell.name} on ${target.type}`);

  state.selectedUnitId = null;
  state.movementRange = null;
  state.attackMode = false;
  state.hireMenuOpen = false;
  state.magicMode = false;
};

const isValidSpellTarget = (caster: Unit, target: Unit, spell: Spell): boolean => {
  if (!isInRange(caster, target, spell.range)) {
    return false;
  }

  if (spell.targetType === "self") {
    return caster.id === target.id;
  }
  if (spell.targetType === "ally") {
    return caster.faction === target.faction;
  }
  if (spell.targetType === "enemy") {
    return caster.faction !== target.faction;
  }
  return false;
};

const isInRange = (caster: Unit, target: Unit, range: number): boolean => {
  const dx = Math.abs(caster.x - target.x);
  const dy = Math.abs(caster.y - target.y);
  return dx + dy <= range;
};

const calcExpGain = (state: GameState, winner: Unit, defeated: Unit): number => {
  const multiplier = getExpMultiplier(winner.type, defeated.type, state.expAffinity);
  return Math.round(state.baseExpPerKill * multiplier);
};

const applyExperience = (state: GameState, unitId: number, expGain: number): void => {
  const unitIndex = state.units.findIndex((unit) => unit.id === unitId);
  if (unitIndex === -1) {
    return;
  }

  const unit = state.units[unitIndex];
  const beforeLevel = unit.level;
  const beforeCrown = unit.crown;
  const beforeType = unit.type;
  let exp = unit.exp + expGain;
  let level = unit.level;
  let crown = unit.crown;

  while (level < 8 && exp >= state.expThresholds[level - 1]) {
    level += 1;
  }

  if (level === 8 && !crown && exp >= state.expThresholds[7]) {
    crown = true;
  }

  let updated: Unit = {
    ...unit,
    exp,
    level,
    crown,
  };

  if (!beforeCrown && crown) {
    const catalog = unitCatalog[unit.type];
    if (catalog?.promotesTo && catalog.promoteAtCrown) {
      const promoted = unitCatalog[catalog.promotesTo];
      if (promoted) {
        updated = {
          ...updated,
          type: promoted.type,
          movePoints: promoted.movePoints,
          maxFood: promoted.maxFood,
          maxHp: promoted.maxHp,
          power: promoted.power,
          defense: promoted.defense,
          food: Math.min(updated.food, promoted.maxFood),
          hp: Math.min(updated.hp, promoted.maxHp),
        };
        console.log(`Class Change: ${beforeType} -> ${promoted.type}`);
      }
    }
  }

  state.units[unitIndex] = updated;

  if (expGain > 0) {
    console.log(`${unit.type} gains ${expGain} exp`);
  }
  if (beforeLevel !== level || beforeCrown !== crown) {
    console.log(`${updated.type} level up to ${crown ? "Crown" : `Lv${level}`}`);
  }
};

export const canSupply = (unit: Unit, tile: { type: TileType; ownerFaction?: FactionId | null }, faction: FactionId): boolean => {
  if (unit.faction !== faction) {
    return false;
  }
  if (tile.ownerFaction !== faction) {
    return false;
  }
  return tile.type === TileType.Town || tile.type === TileType.Castle;
};

export const supply = (
  unit: Unit,
  factionBudget: number,
  params: { costFoodPer1: number; costHpPer1: number },
): { unit: Unit; budget: number; spent: number; recoveredFood: number; recoveredHp: number } => {
  const foodNeeded = Math.max(0, unit.maxFood - unit.food);
  const hpNeeded = Math.max(0, unit.maxHp - unit.hp);
  if (foodNeeded === 0 && hpNeeded === 0) {
    return { unit, budget: factionBudget, spent: 0, recoveredFood: 0, recoveredHp: 0 };
  }

  let budget = factionBudget;
  let recoveredHp = 0;
  let recoveredFood = 0;

  if (params.costHpPer1 > 0) {
    const maxHpAffordable = Math.floor(budget / params.costHpPer1);
    recoveredHp = Math.min(hpNeeded, maxHpAffordable);
    budget -= recoveredHp * params.costHpPer1;
  }

  if (params.costFoodPer1 > 0) {
    const maxFoodAffordable = Math.floor(budget / params.costFoodPer1);
    recoveredFood = Math.min(foodNeeded, maxFoodAffordable);
    budget -= recoveredFood * params.costFoodPer1;
  }

  const spent = factionBudget - budget;
  if (spent === 0) {
    return { unit, budget: factionBudget, spent: 0, recoveredFood: 0, recoveredHp: 0 };
  }

  return {
    unit: {
      ...unit,
      hp: Math.min(unit.maxHp, unit.hp + recoveredHp),
      food: Math.min(unit.maxFood, unit.food + recoveredFood),
    },
    budget,
    spent,
    recoveredFood,
    recoveredHp,
  };
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

export const calcIncome = (
  faction: FactionId,
  map: Scenario["map"],
  baseIncome: number,
  incomePerTown: number,
  incomePerCastle: number,
): { total: number; base: number; towns: number; castles: number } => {
  let towns = 0;
  let castles = 0;
  for (const tile of map.tiles) {
    if (tile.ownerFaction !== faction) {
      continue;
    }
    if (tile.type === TileType.Town) {
      towns += 1;
    }
    if (tile.type === TileType.Castle) {
      castles += 1;
    }
  }

  const total = baseIncome + towns * incomePerTown + castles * incomePerCastle;
  return { total, base: baseIncome, towns, castles };
};

export const canOccupy = (unit: Unit, tile: { type: TileType; ownerFaction?: FactionId | null }): boolean => {
  if (tile.type !== TileType.Town && tile.type !== TileType.Castle) {
    return false;
  }

  if (tile.ownerFaction === unit.faction) {
    return false;
  }

  if (tile.type === TileType.Castle) {
    return unit.type === UnitType.King;
  }

  return unit.type === UnitType.King || unit.type === UnitType.Fighter || unit.type === UnitType.Wizard;
};

const occupyIfPossible = (state: GameState, unit: Unit): boolean => {
  const tile = state.map.tiles[getTileIndex(unit.x, unit.y, state.map.width)];
  if (!canOccupy(unit, tile)) {
    return false;
  }
  const wasOwnedBy = tile.ownerFaction;
  tile.ownerFaction = unit.faction;
  if (tile.type === TileType.Town && wasOwnedBy !== unit.faction) {
    state.uiEffects.push({ kind: "occupy", label: "街を占拠しました！" });
  }
  return true;
};
