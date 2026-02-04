import { GRID_HEIGHT, GRID_WIDTH } from "./constants";
import { Input } from "./Input";

export type Faction = {
  id: number;
  name: string;
};

export type GameState = {
  cursor: {
    x: number;
    y: number;
  };
  turn: {
    factionIndex: number;
    turnNumber: number;
  };
  factions: Faction[];
};

export const createInitialState = (): GameState => {
  return {
    cursor: { x: 0, y: 0 },
    turn: { factionIndex: 0, turnNumber: 1 },
    factions: [
      { id: 0, name: "紅軍" },
      { id: 1, name: "青軍" },
    ],
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
    state.cursor.x = clamp(state.cursor.x + deltaX, 0, GRID_WIDTH - 1);
    state.cursor.y = clamp(state.cursor.y + deltaY, 0, GRID_HEIGHT - 1);
  }

  if (input.isPressed("KeyE")) {
    state.turn.factionIndex = (state.turn.factionIndex + 1) % state.factions.length;
    state.turn.turnNumber += 1;
  }

  if (input.isPressed("Enter") || input.isPressed("Space")) {
    // 決定入力のフック（後でユニット操作へ接続）
  }

  if (input.isPressed("Escape") || input.isPressed("Backspace")) {
    // キャンセル入力のフック（後でUI操作へ接続）
  }
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
