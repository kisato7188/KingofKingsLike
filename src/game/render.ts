import { GameState, canHireAtCastle, canHireUnitType, canOccupy, getEnemyZocTiles } from "./state";
import { HUD_HEIGHT, TILE_SIZE } from "./constants";
import { boardToCanvas, getTileIndex, getViewportHeight, getViewportWidth } from "./geometry";
import { FactionId, TileType, Unit, UnitType } from "./types";
import { hireableUnits, unitCatalog } from "./unitCatalog";

export const render = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  drawTiles(ctx, state);
  drawMoveRange(ctx, state);
  drawZoc(ctx, state);
  drawGrid(ctx, state);
  drawUnits(ctx, state);
  drawCursor(ctx, state);
  drawDebug(ctx, state);
  drawHireMenu(ctx, state);
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

const drawMoveRange = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.movementRange) {
    return;
  }

  ctx.fillStyle = "rgba(88, 160, 255, 0.25)";
  for (const index of state.movementRange.reachable) {
    const x = index % state.map.width;
    const y = Math.floor(index / state.map.width);
    const { x: canvasX, y: canvasY } = boardToCanvas(x, y);
    ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
  }
};

const drawZoc = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const zoc = getEnemyZocTiles(state.units, state.turn.currentFaction, state.map.width, state.map.height);
  ctx.fillStyle = "rgba(255, 88, 88, 0.18)";

  for (const index of zoc) {
    const x = index % state.map.width;
    const y = Math.floor(index / state.map.width);
    const { x: canvasX, y: canvasY } = boardToCanvas(x, y);
    ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
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
    ctx.fillText(getUnitLabel(unit.type), canvasX + TILE_SIZE / 2, canvasY + TILE_SIZE / 2);
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
  const panelWidth = 320;
  const panelHeight = 192;
  const padding = 8;
  const viewportWidth = getViewportWidth(state.map);
  const x = viewportWidth - panelWidth - padding;
  const y = padding;

  ctx.fillStyle = "rgba(15, 17, 22, 0.8)";
  ctx.fillRect(x, y, panelWidth, panelHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y, panelWidth, panelHeight);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const faction = state.factions[state.turn.factionIndex];
  const selectedUnit = state.selectedUnitId !== null
    ? state.units.find((unit) => unit.id === state.selectedUnitId)
    : undefined;

  ctx.fillText(`Cursor: (${state.cursor.x}, ${state.cursor.y})`, x + 8, y + 8);
  ctx.fillText(`Round: ${state.turn.roundCount}`, x + 8, y + 28);
  ctx.fillText("Faction:", x + 8, y + 48);
  ctx.fillStyle = getFactionColor(state, state.turn.currentFaction);
  ctx.fillText(faction.name, x + 72, y + 48);
  ctx.fillStyle = "#e7e7e7";
  ctx.fillText(`Selected: ${selectedUnit ? selectedUnit.type : "None"}`, x + 8, y + 68);
  if (selectedUnit) {
    ctx.fillText(`Food: ${selectedUnit.food}`, x + 8, y + 88);
    if (hasAdjacentEnemy(state, selectedUnit)) {
      ctx.fillText(state.attackMode ? "Attack: Select target" : "Command: Attack (A)", x + 8, y + 108);
    }
    if (canOccupyHere(state, selectedUnit)) {
      ctx.fillText("Command: Occupy (O)", x + 8, y + 128);
    }
    if (canHireHere(state, selectedUnit)) {
      ctx.fillText("Command: Hire (H)", x + 8, y + 148);
    }
  }
  ctx.fillText(`Budget: ${state.budgets[state.turn.currentFaction] ?? 0}`, x + 8, y + 168);
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

const canOccupyHere = (state: GameState, unit: Unit): boolean => {
  if (unit.x !== state.cursor.x || unit.y !== state.cursor.y || unit.acted) {
    return false;
  }
  const tile = state.map.tiles[getTileIndex(unit.x, unit.y, state.map.width)];
  return canOccupy(unit, tile);
};

const canHireHere = (state: GameState, unit: Unit): boolean => {
  return canHireAtCastle(state, unit);
};

const hasAdjacentEnemy = (state: GameState, unit: Unit): boolean => {
  if (!unit) {
    return false;
  }
  return state.units.some((other) => {
    if (other.faction === unit.faction) {
      return false;
    }
    const dx = Math.abs(other.x - unit.x);
    const dy = Math.abs(other.y - unit.y);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
  });
};

const drawHireMenu = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.hireMenuOpen || state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }

  const menuX = 16;
  const menuY = 16;
  const menuWidth = 220;
  const rowHeight = 22;
  const menuHeight = 16 + hireableUnits.length * rowHeight;

  ctx.fillStyle = "rgba(15, 17, 22, 0.9)";
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";

  hireableUnits.forEach((type, index) => {
    const entry = unitCatalog[type];
    if (!entry) {
      return;
    }

    const y = menuY + 8 + index * rowHeight;
    const canHire = canHireUnitType(state, unit, type);
    const isSelected = index === state.hireSelectionIndex;

    if (isSelected) {
      ctx.fillStyle = "rgba(88, 160, 255, 0.25)";
      ctx.fillRect(menuX + 4, y - 2, menuWidth - 8, rowHeight);
    }

    ctx.fillStyle = canHire ? "#e7e7e7" : "rgba(231, 231, 231, 0.4)";
    ctx.fillText(`${entry.name} (${entry.hireCost})`, menuX + 8, y);
  });
};

const getUnitLabel = (type: UnitType): string => {
  switch (type) {
    case UnitType.King:
      return "K";
    case UnitType.Fighter:
      return "F";
    case UnitType.Archer:
      return "A";
    case UnitType.Knight:
      return "N";
    case UnitType.Mage:
      return "M";
    default:
      return "?";
  }
};
