import { GameState } from "./state";
import { HUD_HEIGHT, TILE_SIZE } from "./constants";
import { boardToCanvas, getTileIndex, getViewportHeight, getViewportWidth } from "./geometry";
import { FactionId, TileType, UnitType } from "./types";

export const render = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  drawTiles(ctx, state);
  drawGrid(ctx, state);
  drawUnits(ctx, state);
  drawCursor(ctx, state);
  drawDebug(ctx, state);
};

const drawTiles = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);

  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tile = state.map.tiles[getTileIndex(x, y, state.map.width)];
      const { x: canvasX, y: canvasY } = boardToCanvas(x, y);

      ctx.fillStyle = getTileColor(tile.type);
      ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);

      if (tile.type === TileType.Town || tile.type === TileType.Castle) {
        const ownerColor = tile.ownerFaction !== undefined && tile.ownerFaction !== null
          ? getFactionColor(state, tile.ownerFaction)
          : "rgba(255, 255, 255, 0.35)";
        ctx.strokeStyle = ownerColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(canvasX + 2, canvasY + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }
};

const drawGrid = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const originY = HUD_HEIGHT;
  const gridWidth = state.map.width * TILE_SIZE;
  const gridHeight = state.map.height * TILE_SIZE;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= state.map.width; x += 1) {
    const px = x * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(px, originY);
    ctx.lineTo(px, originY + gridHeight);
    ctx.stroke();
  }

  for (let y = 0; y <= state.map.height; y += 1) {
    const py = originY + y * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(gridWidth, py);
    ctx.stroke();
  }
};

const drawUnits = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  for (const unit of state.units) {
    const { x: canvasX, y: canvasY } = boardToCanvas(unit.x, unit.y);
    const color = getFactionColor(state, unit.faction);
    const size = 18;
    const offset = (TILE_SIZE - size) / 2;

    ctx.fillStyle = color;
    ctx.fillRect(canvasX + offset, canvasY + offset, size, size);

    ctx.fillStyle = "#0f1116";
    ctx.font = "12px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(unit.type === UnitType.King ? "K" : "F", canvasX + TILE_SIZE / 2, canvasY + TILE_SIZE / 2);
  }
};

const drawCursor = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const { x, y } = boardToCanvas(state.cursor.x, state.cursor.y);

  ctx.fillStyle = "rgba(255, 219, 88, 0.25)";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = "#ffdb58";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
};

const drawDebug = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  ctx.fillStyle = "rgba(15, 17, 22, 0.8)";
  ctx.fillRect(8, 8, 260, 80);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(8, 8, 260, 80);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";

  const faction = state.factions[state.turn.factionIndex];
  const selectedUnit = state.selectedUnitId !== null
    ? state.units.find((unit) => unit.id === state.selectedUnitId)
    : undefined;

  ctx.fillText(`Cursor: (${state.cursor.x}, ${state.cursor.y})`, 16, 16);
  ctx.fillText(`Turn: ${state.turn.turnNumber}`, 16, 36);
  ctx.fillText(`Faction: ${faction.name}`, 16, 56);
  ctx.fillText(`Selected: ${selectedUnit ? selectedUnit.type : "None"}`, 140, 56);
};

const getTileColor = (type: TileType): string => {
  switch (type) {
    case TileType.Grass:
      return "#3c7a3f";
    case TileType.Road:
      return "#8d7f60";
    case TileType.Forest:
      return "#2f5f3a";
    case TileType.Mountain:
      return "#5d5d66";
    case TileType.Town:
      return "#a9815e";
    case TileType.Castle:
      return "#6b6b6b";
    default:
      return "#3c7a3f";
  }
};

const getFactionColor = (state: GameState, factionId: FactionId): string => {
  return state.factions.find((faction) => faction.id === factionId)?.color ?? "#ffffff";
};
