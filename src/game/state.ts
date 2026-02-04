import { Input } from "./Input";
import { sampleScenario } from "../scenarios/sampleScenario";
import { Faction, FactionId, Scenario, Unit } from "./types";

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
    const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
    if (unit && unit.faction === state.turn.currentFaction && !unit.acted) {
      state.selectedUnitId = unit.id;
    }
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    state.selectedUnitId = null;
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
