import {
  GameState,
  canHireAtCastle,
  canHireUnitType,
  canOccupy,
  canSupply,
  getActionMenuOptions,
  getEnemyZocTiles,
  getHirePlacementPositions,
} from "./state";
import {
  ACTION_MENU_WIDTH,
  CURSOR_INSET,
  CURSOR_STROKE_WIDTH,
  HIRE_MENU_WIDTH,
  MENU_EDGE_PADDING,
  MENU_FONT_SIZE,
  MENU_HIGHLIGHT_INSET,
  MENU_HIGHLIGHT_OFFSET,
  MENU_ITEM_TOP,
  MENU_PADDING_Y,
  MENU_PANEL_MARGIN,
  MENU_ROW_HEIGHT,
  MENU_TEXT_OFFSET_X,
  MENU_UNIT_OFFSET,
  SIDEBAR_WIDTH,
  TILE_SIZE,
} from "./constants";
import { boardToCanvas, getTileIndex, getViewportHeight, getViewportWidth } from "./geometry";
import { FactionId, TileType, Unit, UnitType } from "./types";
import { hireableUnits, unitCatalog } from "./unitCatalog";

type UnitImageState = {
  image: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
};

const unitImageCache = new Map<UnitType, UnitImageState>();

const getUnitImage = (unitType: UnitType): UnitImageState => {
  const cached = unitImageCache.get(unitType);
  if (cached) {
    return cached;
  }

  const image = new Image();
  const state: UnitImageState = {
    image,
    loaded: false,
    failed: false,
  };

  image.onload = () => {
    state.loaded = true;
  };
  image.onerror = () => {
    state.failed = true;
  };
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  image.src = `${normalizedBase}units/${unitType}.png`;

  unitImageCache.set(unitType, state);
  return state;
};

export type UnitDrawPositions = Map<number, { x: number; y: number }>;
export type MapView = { zoom: number; offsetX: number; offsetY: number };

const getView = (view?: MapView): MapView => {
  return view ?? { zoom: 1, offsetX: 0, offsetY: 0 };
};

const mapToScreen = (view: MapView, mapX: number, mapY: number): { x: number; y: number } => {
  return {
    x: view.offsetX + mapX * view.zoom,
    y: view.offsetY + mapY * view.zoom,
  };
};

export const render = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unitDrawPositions?: UnitDrawPositions,
  view?: MapView,
): void => {
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);
  const mapWidthPx = state.map.width * TILE_SIZE;
  const mapHeightPx = state.map.height * TILE_SIZE;

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, mapWidthPx, mapHeightPx);
  ctx.clip();
  if (view) {
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.zoom, view.zoom);
  }

  drawTiles(ctx, state);
  drawMoveRange(ctx, state);
  drawHirePlacement(ctx, state);
  drawZoc(ctx, state);
  drawGrid(ctx, state);
  drawUnits(ctx, state, unitDrawPositions);
  drawCursor(ctx, state);
  ctx.restore();

  drawActionMenu(ctx, state, view);
  drawContextMenu(ctx, state, view);
  drawHireMenu(ctx, state);
  drawGlobalInfo(ctx, state);
  drawUnitInfo(ctx, state);
};

const drawTiles = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const mapWidthPx = state.map.width * TILE_SIZE;
  const mapHeightPx = state.map.height * TILE_SIZE;

  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0, 0, mapWidthPx, mapHeightPx);

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

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(canvasX + 6, canvasY + 6, TILE_SIZE - 12, 16);
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px 'Noto Sans JP', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(tile.type === TileType.Castle ? "城" : "町", canvasX + TILE_SIZE / 2, canvasY + 6);
      }
    }
  }
};

const drawGrid = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const gridWidth = state.map.width * TILE_SIZE;
  const gridHeight = state.map.height * TILE_SIZE;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= state.map.width; x += 1) {
    const px = x * TILE_SIZE;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, gridHeight);
    ctx.stroke();
  }

  for (let y = 0; y <= state.map.height; y += 1) {
    const py = y * TILE_SIZE;
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

const drawHirePlacement = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.hirePlacementMode || state.hirePlacementOriginId === null) {
    return;
  }

  const king = state.units.find((unit) => unit.id === state.hirePlacementOriginId);
  if (!king) {
    return;
  }

  const positions = getHirePlacementPositions(state, king);
  if (positions.length === 0) {
    return;
  }

  ctx.fillStyle = "rgba(88, 255, 176, 0.25)";
  for (const pos of positions) {
    const { x: canvasX, y: canvasY } = boardToCanvas(pos.x, pos.y);
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

const drawUnits = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unitDrawPositions?: UnitDrawPositions,
): void => {
  for (const unit of state.units) {
    const drawPosition = unitDrawPositions?.get(unit.id) ?? { x: unit.x, y: unit.y };
    const { x: canvasX, y: canvasY } = boardToCanvas(drawPosition.x, drawPosition.y);
    const color = getFactionColor(state, unit.faction);
    const size = 18;
    const offset = (TILE_SIZE - size) / 2;

    const imageState = getUnitImage(unit.type);
    if (imageState.loaded && !imageState.failed) {
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imageState.image, canvasX, canvasY, TILE_SIZE, TILE_SIZE);
      ctx.imageSmoothingEnabled = smoothing;
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(canvasX + offset, canvasY + offset, size, size);

      ctx.fillStyle = "#0f1116";
      ctx.font = "12px 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(getUnitLabel(unit.type), canvasX + TILE_SIZE / 2, canvasY + TILE_SIZE / 2);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(getLevelLabel(unit), canvasX + 4, canvasY + 4);

    ctx.fillStyle = "#ffffff";
    ctx.font = "18px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${unit.hp}/${unit.maxHp}`, canvasX + TILE_SIZE - 4, canvasY + TILE_SIZE - 4);

    const movePossible = !unit.acted && !unit.movedThisTurn && unit.food > 0;
    const actionPossible = !unit.acted;
    const actionLabel = `${movePossible ? "M" : ""}${actionPossible ? "A" : ""}`;
    if (actionLabel.length > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "9px 'Noto Sans JP', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(actionLabel, canvasX + 4, canvasY + TILE_SIZE - 4);
    }
  }
};

const drawCursor = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (state.actionMenuOpen || state.hireMenuOpen || state.contextMenuOpen) {
    return;
  }
  const { x, y } = boardToCanvas(state.cursor.x, state.cursor.y);

  ctx.fillStyle = "rgba(255, 219, 88, 0.25)";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = "#ffdb58";
  ctx.lineWidth = CURSOR_STROKE_WIDTH;
  ctx.strokeRect(x + CURSOR_INSET, y + CURSOR_INSET, TILE_SIZE - CURSOR_INSET * 2, TILE_SIZE - CURSOR_INSET * 2);
};

const drawActionMenu = (ctx: CanvasRenderingContext2D, state: GameState, view?: MapView): void => {
  if (!state.actionMenuOpen || state.selectedUnitId === null || state.hireMenuOpen) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }

  const options = getActionMenuOptions(state, unit);
  if (options.length === 0) {
    return;
  }

  const mapView = getView(view);
  const { x: unitX, y: unitY } = boardToCanvas(unit.x, unit.y);
  const screenPos = mapToScreen(mapView, unitX, unitY);
  const menuWidth = ACTION_MENU_WIDTH;
  const rowHeight = MENU_ROW_HEIGHT;
  const menuHeight = MENU_PADDING_Y + options.length * rowHeight;
  const mapWidthPx = state.map.width * TILE_SIZE * mapView.zoom;
  const mapHeightPx = state.map.height * TILE_SIZE * mapView.zoom;
  const minX = mapView.offsetX + MENU_EDGE_PADDING;
  const minY = mapView.offsetY + MENU_EDGE_PADDING;
  const maxX = mapView.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
  const maxY = mapView.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
  const menuX = Math.max(minX, Math.min(screenPos.x + TILE_SIZE * mapView.zoom + MENU_UNIT_OFFSET, maxX));
  const menuY = Math.max(minY, Math.min(screenPos.y - MENU_UNIT_OFFSET, maxY));

  ctx.fillStyle = "rgba(15, 17, 22, 0.92)";
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  ctx.font = `${MENU_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = "top";

  options.forEach((option, index) => {
    const y = menuY + MENU_ITEM_TOP + index * rowHeight;
    const isSelected = index === state.actionMenuIndex;
    if (isSelected) {
      ctx.fillStyle = "rgba(88, 160, 255, 0.25)";
      ctx.fillRect(menuX + MENU_HIGHLIGHT_INSET, y - MENU_HIGHLIGHT_OFFSET, menuWidth - MENU_HIGHLIGHT_INSET * 2, rowHeight);
    }
    ctx.fillStyle = "#e7e7e7";
    ctx.fillText(option.label, menuX + MENU_TEXT_OFFSET_X, y);
  });
};

const drawContextMenu = (ctx: CanvasRenderingContext2D, state: GameState, view?: MapView): void => {
  if (!state.contextMenuOpen) {
    return;
  }

  const anchor = state.contextMenuAnchor ?? state.cursor;
  const mapView = getView(view);
  const { x: cursorX, y: cursorY } = boardToCanvas(anchor.x, anchor.y);
  const screenPos = mapToScreen(mapView, cursorX, cursorY);
  const menuWidth = ACTION_MENU_WIDTH;
  const rowHeight = MENU_ROW_HEIGHT;
  const menuHeight = MENU_PADDING_Y + rowHeight;
  const mapWidthPx = state.map.width * TILE_SIZE * mapView.zoom;
  const mapHeightPx = state.map.height * TILE_SIZE * mapView.zoom;
  const minX = mapView.offsetX + MENU_EDGE_PADDING;
  const minY = mapView.offsetY + MENU_EDGE_PADDING;
  const maxX = mapView.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
  const maxY = mapView.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
  const menuX = Math.max(minX, Math.min(screenPos.x + TILE_SIZE * mapView.zoom + MENU_UNIT_OFFSET, maxX));
  const menuY = Math.max(minY, Math.min(screenPos.y - MENU_UNIT_OFFSET, maxY));

  ctx.fillStyle = "rgba(15, 17, 22, 0.92)";
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  ctx.font = `${MENU_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = "top";

  const rowY = menuY + MENU_ITEM_TOP;
  if (state.contextMenuIndex === 0) {
    ctx.fillStyle = "rgba(88, 160, 255, 0.25)";
    ctx.fillRect(menuX + MENU_HIGHLIGHT_INSET, rowY - MENU_HIGHLIGHT_OFFSET, menuWidth - MENU_HIGHLIGHT_INSET * 2, rowHeight);
  }
  ctx.fillStyle = "#e7e7e7";
  ctx.fillText("ターン終了", menuX + MENU_TEXT_OFFSET_X, rowY);
};

const drawGlobalInfo = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const panelWidth = SIDEBAR_WIDTH;
  const viewportWidth = getViewportWidth(state.map);
  const x = viewportWidth - panelWidth;
  const y = 0;
  const height = 180;

  ctx.fillStyle = "rgba(15, 17, 22, 0.82)";
  ctx.fillRect(x, y, panelWidth, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y, panelWidth, height);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const faction = state.factions[state.turn.factionIndex];
  const controller = state.config.controllers[state.turn.currentFaction] ?? "Human";

  let lineY = y + 8;
  const lineHeight = 18;

  ctx.fillText(`Cursor: (${state.cursor.x}, ${state.cursor.y})`, x + 8, lineY);
  lineY += lineHeight;
  ctx.fillText(`Round: ${state.turn.roundCount}`, x + 8, lineY);
  lineY += lineHeight;
  ctx.fillText("Faction:", x + 8, lineY);
  ctx.fillStyle = getFactionColor(state, state.turn.currentFaction);
  ctx.fillText(faction.name, x + 72, lineY);
  ctx.fillStyle = "#e7e7e7";
  lineY += lineHeight;
  ctx.fillText(`Ctrl: ${controller} (1-4)`, x + 8, lineY);
  lineY += lineHeight;
  ctx.fillText(`Budget: ${state.budgets[state.turn.currentFaction] ?? 0}`, x + 8, lineY);
};

const drawUnitInfo = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const panelWidth = SIDEBAR_WIDTH;
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);
  const x = viewportWidth - panelWidth;
  const height = 220;
  const y = viewportHeight - height;

  ctx.fillStyle = "rgba(15, 17, 22, 0.82)";
  ctx.fillRect(x, y, panelWidth, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y, panelWidth, height);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = "14px 'Noto Sans JP', sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const hoveredUnit = state.units.find((unit) => unit.x === state.cursor.x && unit.y === state.cursor.y);

  let lineY = y + 8;
  const lineHeight = 18;

  ctx.fillText(`Unit: ${hoveredUnit ? hoveredUnit.type : "None"}`, x + 8, lineY);
  if (hoveredUnit) {
    lineY += lineHeight;
    ctx.fillText(`Food: ${hoveredUnit.food}/${hoveredUnit.maxFood}`, x + 8, lineY);
    lineY += lineHeight;
    ctx.fillText(`HP: ${hoveredUnit.hp}/${hoveredUnit.maxHp}`, x + 8, lineY);
    lineY += lineHeight;
    ctx.fillText(`LV: ${getLevelLabel(hoveredUnit)}  EXP: ${hoveredUnit.exp}`, x + 8, lineY);
    if (hasAdjacentEnemy(state, hoveredUnit)) {
      lineY += lineHeight;
      ctx.fillText(state.attackMode ? "Attack: Select target" : "Command: Attack (A)", x + 8, lineY);
    }
    if (canOccupyHere(state, hoveredUnit)) {
      lineY += lineHeight;
      ctx.fillText("Command: Occupy (O)", x + 8, lineY);
    }
    if (canHireHere(state, hoveredUnit)) {
      lineY += lineHeight;
      ctx.fillText("Command: Hire (H)", x + 8, lineY);
    }
    if (canSupplyHere(state, hoveredUnit)) {
      lineY += lineHeight;
      ctx.fillText("Command: Supply (S)", x + 8, lineY);
    }
    if (canMagicHere(state, hoveredUnit)) {
      lineY += lineHeight;
      ctx.fillText(state.magicMode ? "Magic: Select target" : "Command: Magic (M)", x + 8, lineY);
    }
    if (state.magicError) {
      lineY += lineHeight;
      ctx.fillText(state.magicError, x + 8, lineY);
    }
  }
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

const getLevelLabel = (unit: Unit): string => {
  return unit.crown ? "C" : `Lv${unit.level}`;
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

const canSupplyHere = (state: GameState, unit: Unit): boolean => {
  if (unit.x !== state.cursor.x || unit.y !== state.cursor.y || unit.acted) {
    return false;
  }
  const tile = state.map.tiles[getTileIndex(unit.x, unit.y, state.map.width)];
  return canSupply(unit, tile, unit.faction);
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
const canMagicHere = (state: GameState, unit: Unit): boolean => {
  return isCaster(unit);
};

const isCaster = (unit: Unit): boolean => {
  return unitCatalog[unit.type]?.isCaster ?? false;
};

const drawHireMenu = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.hireMenuOpen || state.selectedUnitId === null) {
    return;
  }

  const unit = state.units.find((entry) => entry.id === state.selectedUnitId);
  if (!unit) {
    return;
  }

  const menuX = MENU_PANEL_MARGIN;
  const menuY = MENU_PANEL_MARGIN;
  const menuWidth = HIRE_MENU_WIDTH;
  const rowHeight = MENU_ROW_HEIGHT;
  const menuHeight = MENU_PADDING_Y + hireableUnits.length * rowHeight;

  ctx.fillStyle = "rgba(15, 17, 22, 0.9)";
  ctx.fillRect(menuX, menuY, menuWidth, menuHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.strokeRect(menuX, menuY, menuWidth, menuHeight);

  ctx.font = `${MENU_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = "top";

  hireableUnits.forEach((type, index) => {
    const entry = unitCatalog[type];
    if (!entry) {
      return;
    }

    const y = menuY + MENU_ITEM_TOP + index * rowHeight;
    const canHire = canHireUnitType(state, unit, type);
    const isSelected = index === state.hireSelectionIndex;

    if (isSelected) {
      ctx.fillStyle = "rgba(88, 160, 255, 0.25)";
      ctx.fillRect(menuX + MENU_HIGHLIGHT_INSET, y - MENU_HIGHLIGHT_OFFSET, menuWidth - MENU_HIGHLIGHT_INSET * 2, rowHeight);
    }

    ctx.fillStyle = canHire ? "#e7e7e7" : "rgba(231, 231, 231, 0.4)";
    ctx.fillText(`${entry.name} (${entry.hireCost})`, menuX + MENU_TEXT_OFFSET_X, y);
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
    case UnitType.Wizard:
      return "W";
    default:
      return "?";
  }
};
