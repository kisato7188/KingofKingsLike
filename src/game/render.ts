import { GameState } from "./state";
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from "./constants";

export const render = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  drawGrid(ctx);
  drawCursor(ctx, state);
  drawDebug(ctx, state);
};

const drawGrid = (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = "#1b1f2a";
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= GRID_WIDTH; x += 1) {
    const px = x * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, VIEWPORT_HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y <= GRID_HEIGHT; y += 1) {
    const py = y * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(VIEWPORT_WIDTH, py);
    ctx.stroke();
  }
};

const drawCursor = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const x = state.cursor.x * TILE_SIZE;
  const y = state.cursor.y * TILE_SIZE;

  ctx.fillStyle = "rgba(255, 219, 88, 0.25)";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = "#ffdb58";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
};

const drawDebug = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  ctx.fillStyle = "rgba(15, 17, 22, 0.8)";
  ctx.fillRect(8, 8, 220, 80);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(8, 8, 220, 80);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";

  const faction = state.factions[state.turn.factionIndex];

  ctx.fillText(`Cursor: (${state.cursor.x}, ${state.cursor.y})`, 16, 16);
  ctx.fillText(`Turn: ${state.turn.turnNumber}`, 16, 36);
  ctx.fillText(`Faction: ${faction.name}`, 16, 56);
};
