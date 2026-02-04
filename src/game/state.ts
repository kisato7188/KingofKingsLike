import { Input } from "./Input";
import { sampleScenario } from "../scenarios/sampleScenario";
import { Faction, Scenario, Unit } from "./stateTypes";

export type GameState = {
  scenario: Scenario;
  cursor: {
    x: number;
    y: number;
  };
  turn: {
    factionIndex: number;
    turnNumber: number;
  };
  factions: Faction[];
  map: Scenario["map"];
  units: Unit[];
  selectedUnitId: number | null;
};

export const createInitialState = (): GameState => {
  const scenario = sampleScenario;
  return {
    scenario,
    cursor: { x: 0, y: 0 },
    turn: { factionIndex: 0, turnNumber: 1 },
    factions: scenario.factions,
    map: scenario.map,
    units: scenario.units,
    selectedUnitId: null,
  };
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
    state.turn.factionIndex = (state.turn.factionIndex + 1) % state.factions.length;
    state.turn.turnNumber += 1;
  }

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    const unit = getUnitAt(state, state.cursor.x, state.cursor.y);
    state.selectedUnitId = unit ? unit.id : null;
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    state.selectedUnitId = null;
  }
};

export const getUnitAt = (state: GameState, x: number, y: number): Unit | undefined => {
  return state.units.find((unit) => unit.x === x && unit.y === y);
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
