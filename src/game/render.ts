import {
  GameState,
  canHireAtCastle,
  canHireUnitType,
  canOccupy,
  canSupply,
  getActionMenuOptions,
  getAttackRange,
  getEnemyZocTiles,
  getHirePlacementPositions,
  isInAttackRange,
} from "./state";
import {
  ACTION_MENU_WIDTH,
  ACTION_LABEL_FONT_SIZE,
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
  SIDEBAR_FONT_SIZE,
  SIDEBAR_LINE_HEIGHT,
  SIDEBAR_PANEL_PADDING,
  SIDEBAR_WIDTH,
  TILE_SIZE,
} from "./constants";
import {
  boardToCanvas,
  getMapFrameHeight,
  getMapFrameWidth,
  getTileIndex,
  getViewportHeight,
  getViewportWidth,
} from "./geometry";
import { FactionId, TileType, Unit, UnitType } from "./types";
import { hireableUnits, unitCatalog } from "./unitCatalog";
import { UiEffect } from "./state";

type UnitImageState = {
  image: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
};

type TileImageState = {
  image: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
};

const unitImageCache = new Map<UnitType, UnitImageState>();
const unitTintCache = new Map<string, HTMLCanvasElement>();
const tileImageCache = new Map<TileType, TileImageState>();

const tileImageFiles: Record<TileType, string> = {
  [TileType.Grass]: "001.png",
  [TileType.Forest]: "009.png",
  [TileType.Mountain]: "014.png",
  [TileType.Town]: "023.png",
  [TileType.Road]: "028.png",
  [TileType.Castle]: "030.png",
};

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

const getTintedUnitImage = (unitType: UnitType, tintColor: string): HTMLCanvasElement | null => {
  const key = `${unitType}-${tintColor}`;
  const cached = unitTintCache.get(key);
  if (cached) {
    return cached;
  }

  const imageState = getUnitImage(unitType);
  if (!imageState.loaded || imageState.failed) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = imageState.image.width;
  canvas.height = imageState.image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.drawImage(imageState.image, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = tintColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  unitTintCache.set(key, canvas);
  return canvas;
};

const getTileImage = (tileType: TileType): TileImageState => {
  const cached = tileImageCache.get(tileType);
  if (cached) {
    return cached;
  }

  const image = new Image();
  const state: TileImageState = {
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
  image.src = `${normalizedBase}tileset/${tileImageFiles[tileType]}`;

  tileImageCache.set(tileType, state);
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

const drawUiEffect = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  effectState: { effect: UiEffect; elapsed: number; duration: number } | null,
): void => {
  if (!effectState) {
    return;
  }

  const { effect, elapsed, duration } = effectState;
  if (effect.kind === "hire") {
    return;
  }
  const frameWidth = getMapFrameWidth();
  const frameHeight = getMapFrameHeight();
  const bandHeight = Math.round(TILE_SIZE * (effect.kind === "attack" ? 2.6 : 1.2));
  const bandY = Math.round((frameHeight - bandHeight) / 2);

  const inDuration = duration * 0.25;
  const outDuration = duration * 0.25;
  const holdDuration = Math.max(0, duration - inDuration - outDuration);

  let textX = frameWidth / 2;
  if (elapsed < inDuration) {
    const t = elapsed / inDuration;
    textX = -frameWidth * 0.4 + t * (frameWidth * 0.9);
  } else if (elapsed > inDuration + holdDuration) {
    const t = (elapsed - inDuration - holdDuration) / outDuration;
    textX = frameWidth / 2 + t * (frameWidth * 0.9);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, bandY, frameWidth, bandHeight);

  ctx.font = `${Math.round(TILE_SIZE * 0.55)}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";

  const centerY = bandY + bandHeight / 2;

  if (effect.kind === "turn") {
    ctx.fillStyle = effect.color;
    ctx.fillText(effect.label, textX, centerY);
    return;
  }

  if (effect.kind === "occupy") {
    ctx.fillStyle = effect.color;
    ctx.fillText(effect.label, textX, centerY);
    return;
  }

  ctx.fillText("Attack!", textX, centerY);

  const showPortraits = elapsed < inDuration + holdDuration;
  if (!showPortraits) {
    return;
  }

  const attackerImage = getUnitImage(effect.attackerType);
  const defenderImage = getUnitImage(effect.defenderType);
  const portraitSize = Math.round(TILE_SIZE * 1.9);
  const portraitY = bandY + Math.round(bandHeight * 0.1);
  const leftX = Math.round(frameWidth * 0.18 - portraitSize / 2);
  const rightX = Math.round(frameWidth * 0.82 - portraitSize / 2);

  if (attackerImage.loaded && !attackerImage.failed) {
    ctx.drawImage(attackerImage.image, leftX, portraitY, portraitSize, portraitSize);
  } else {
    ctx.fillStyle = getFactionColor(state, effect.attackerFaction);
    ctx.fillRect(leftX, portraitY, portraitSize, portraitSize);
    ctx.fillStyle = "#0f1116";
    ctx.font = `${Math.round(TILE_SIZE * 0.3)}px 'Noto Sans JP', sans-serif`;
    ctx.fillText(effect.attackerType, leftX + portraitSize / 2, portraitY + portraitSize / 2);
  }

  if (defenderImage.loaded && !defenderImage.failed) {
    ctx.drawImage(defenderImage.image, rightX, portraitY, portraitSize, portraitSize);
  } else {
    ctx.fillStyle = getFactionColor(state, effect.defenderFaction);
    ctx.fillRect(rightX, portraitY, portraitSize, portraitSize);
    ctx.fillStyle = "#0f1116";
    ctx.font = `${Math.round(TILE_SIZE * 0.3)}px 'Noto Sans JP', sans-serif`;
    ctx.fillText(effect.defenderType, rightX + portraitSize / 2, portraitY + portraitSize / 2);
  }

  ctx.fillStyle = "#e7e7e7";
  ctx.font = `${Math.round(TILE_SIZE * 0.22)}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const hpTextY = portraitY + portraitSize + Math.round(TILE_SIZE * 0.08);
  ctx.fillText(
    `HP：${effect.attackerHpBefore}→${effect.attackerHpAfter}`,
    leftX + portraitSize / 2,
    hpTextY,
  );
  ctx.fillText(
    `HP：${effect.defenderHpBefore}→${effect.defenderHpAfter}`,
    rightX + portraitSize / 2,
    hpTextY,
  );
};

const drawHireFlash = (
  ctx: CanvasRenderingContext2D,
  effectState: { effect: UiEffect; elapsed: number; duration: number } | null,
): void => {
  if (!effectState || effectState.effect.kind !== "hire") {
    return;
  }

  const { effect, elapsed, duration } = effectState;
  const totalBlinks = 3;
  const interval = duration / (totalBlinks * 2);
  const phase = Math.floor(elapsed / interval);
  if (phase % 2 !== 0) {
    return;
  }

  const { x: canvasX, y: canvasY } = boardToCanvas(effect.x, effect.y);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
};

export const render = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unitDrawPositions?: UnitDrawPositions,
  view?: MapView,
  effectState?: { effect: UiEffect; elapsed: number; duration: number } | null,
  animatingUnits?: Set<number>,
): void => {
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);
  const frameWidthPx = getMapFrameWidth();
  const frameHeightPx = getMapFrameHeight();

  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  ctx.fillStyle = "#0f1116";
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, frameWidthPx, frameHeightPx);
  ctx.clip();
  if (view) {
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.zoom, view.zoom);
  }

  drawTiles(ctx, state);
  drawMoveRange(ctx, state);
  drawAttackRange(ctx, state);
  drawHirePlacement(ctx, state);
  drawZoc(ctx, state);
  drawGrid(ctx, state);
  drawUnits(ctx, state, unitDrawPositions, animatingUnits);
  drawHireFlash(ctx, effectState ?? null);
  drawCursor(ctx, state);
  ctx.restore();

  drawActionMenu(ctx, state, view);
  drawContextMenu(ctx, state, view);
  drawHireMenu(ctx, state);
  drawGlobalInfo(ctx, state);
  drawEnemyBudget(ctx, state);
  drawUnitInfo(ctx, state);
  drawUiEffect(ctx, state, effectState ?? null);
  drawIncomeResult(ctx, state);
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

      const tileImage = getTileImage(tile.type);
      if (tileImage.loaded && !tileImage.failed) {
        const imageWidth = tileImage.image.width || TILE_SIZE;
        const imageHeight = tileImage.image.height || TILE_SIZE;
        const scale = TILE_SIZE / imageWidth;
        const drawWidth = imageWidth * scale;
        const drawHeight = imageHeight * scale;
        const drawY = canvasY + TILE_SIZE - drawHeight;
        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tileImage.image, canvasX, drawY, drawWidth, drawHeight);
        ctx.imageSmoothingEnabled = smoothing;
      } else {
        ctx.fillStyle = getTileColor(tile.type);
        ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
      }

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

const drawAttackRange = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.attackMode || state.selectedUnitId === null) {
    return;
  }

  const attacker = state.units.find((unit) => unit.id === state.selectedUnitId);
  if (!attacker) {
    return;
  }

  ctx.fillStyle = "rgba(255, 88, 88, 0.35)";

  const range = getAttackRange(attacker);
  for (let y = attacker.y - range; y <= attacker.y + range; y += 1) {
    if (y < 0 || y >= state.map.height) {
      continue;
    }
    for (let x = attacker.x - range; x <= attacker.x + range; x += 1) {
      if (x < 0 || x >= state.map.width) {
        continue;
      }
      if (!isInAttackRange(attacker, x, y)) {
        continue;
      }
      const { x: canvasX, y: canvasY } = boardToCanvas(x, y);
      ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
    }
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
  animatingUnits?: Set<number>,
): void => {
  for (const unit of state.units) {
    const drawPosition = unitDrawPositions?.get(unit.id) ?? { x: unit.x, y: unit.y };
    const { x: canvasX, y: canvasY } = boardToCanvas(drawPosition.x, drawPosition.y);
    const color = getFactionColor(state, unit.faction);
    const spriteScale = 1.2;
    const spriteSize = Math.round(TILE_SIZE * spriteScale);
    const spriteShiftY = Math.round(spriteSize * 0.25);
    const spriteX = canvasX + TILE_SIZE / 2 - spriteSize / 2;
    const spriteY = canvasY - spriteShiftY;
    const outlineSize = Math.round(spriteSize * 1.06);
    const outlineOffset = (outlineSize - spriteSize) / 2;
    const outlineX = spriteX - outlineOffset;
    const outlineY = spriteY - outlineOffset;
    const fallbackSize = Math.round(TILE_SIZE * 0.22);
    const fallbackShiftY = Math.round(fallbackSize * 0.25);
    const fallbackX = canvasX + TILE_SIZE / 2 - fallbackSize / 2;
    const fallbackY = canvasY - fallbackShiftY;

    const imageState = getUnitImage(unit.type);
    if (imageState.loaded && !imageState.failed) {
      const tinted = getTintedUnitImage(unit.type, color);
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      if (tinted) {
        ctx.drawImage(tinted, outlineX, outlineY, outlineSize, outlineSize);
      }
      ctx.drawImage(imageState.image, spriteX, spriteY, spriteSize, spriteSize);
      ctx.imageSmoothingEnabled = smoothing;
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(fallbackX, fallbackY, fallbackSize, fallbackSize);

      ctx.fillStyle = "#0f1116";
      ctx.font = "12px 'Noto Sans JP', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(getUnitLabel(unit.type), canvasX + TILE_SIZE / 2, canvasY + TILE_SIZE / 2);
    }

    if (unit.acted && !animatingUnits?.has(unit.id)) {
      ctx.fillStyle = "rgba(120, 120, 120, 0.45)";
      ctx.fillRect(canvasX, canvasY, TILE_SIZE, TILE_SIZE);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px 'Noto Sans JP', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(getLevelLabel(unit), canvasX + 4, canvasY + 4);

    const controller = state.config.controllers[unit.faction] ?? "Human";
    const isPlayer = controller === "Human";
    const badgeText = isPlayer ? "P" : "E";
    ctx.font = "18px 'Noto Sans JP', sans-serif";
    const badgeWidth = ctx.measureText(badgeText).width;
    const badgeHeight = 18;
    const badgePaddingX = 6;
    const badgePaddingY = 2;
    const badgeRight = canvasX + TILE_SIZE - 4;
    const badgeTop = canvasY + 4;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(
      badgeRight - badgeWidth - badgePaddingX * 2,
      badgeTop - badgePaddingY,
      badgeWidth + badgePaddingX * 2,
      badgeHeight + badgePaddingY * 2,
    );
    ctx.fillStyle = isPlayer ? "#4dabf7" : "#ff6b6b";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(badgeText, badgeRight - badgePaddingX, badgeTop);

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
      ctx.font = `${ACTION_LABEL_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
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
  const frameWidthPx = getMapFrameWidth();
  const frameHeightPx = getMapFrameHeight();
  const minX = MENU_EDGE_PADDING;
  const minY = MENU_EDGE_PADDING;
  const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
  const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
  const frameWidthPx = getMapFrameWidth();
  const frameHeightPx = getMapFrameHeight();
  const minX = MENU_EDGE_PADDING;
  const minY = MENU_EDGE_PADDING;
  const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
  const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
  const height = 200;

  ctx.fillStyle = "rgba(15, 17, 22, 0.82)";
  ctx.fillRect(x, y, panelWidth, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y, panelWidth, height);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = `${SIDEBAR_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const tile = state.map.tiles[getTileIndex(state.cursor.x, state.cursor.y, state.map.width)];
  const terrainLabel = getTerrainLabel(tile.type);
  const defensePercent = getTerrainDefensePercent(tile.type);

  let lineY = y + SIDEBAR_PANEL_PADDING;
  const lineHeight = SIDEBAR_LINE_HEIGHT;

  ctx.fillText(`座標：(${state.cursor.x}, ${state.cursor.y})`, x + SIDEBAR_PANEL_PADDING, lineY);
  lineY += lineHeight;
  ctx.fillText(`ターン：${state.turn.roundCount}`, x + SIDEBAR_PANEL_PADDING, lineY);
  lineY += lineHeight;
  ctx.fillText(`資金：${state.budgets[state.turn.currentFaction] ?? 0}`, x + SIDEBAR_PANEL_PADDING, lineY);
  lineY += lineHeight;
  ctx.fillText(`地形：${terrainLabel}（防御効果${defensePercent}%）`, x + SIDEBAR_PANEL_PADDING, lineY);
  if (tile.type === TileType.Town) {
    lineY += lineHeight;
    const owner = tile.ownerFaction;
    let ownerLabel = "なし";
    if (owner !== undefined && owner !== null) {
      const controller = state.config.controllers[owner] ?? "Human";
      ownerLabel = controller === "Human" ? "プレイヤー" : "エネミー";
    }
    const prefix = "所属：";
    ctx.fillStyle = "#e7e7e7";
    ctx.fillText(prefix, x + SIDEBAR_PANEL_PADDING, lineY);
    let ownerColor = "#e7e7e7";
    if (owner !== undefined && owner !== null) {
      const controller = state.config.controllers[owner] ?? "Human";
      ownerColor = controller === "Human" ? "#4dabf7" : "#ff6b6b";
    }
    const prefixWidth = ctx.measureText(prefix).width;
    ctx.fillStyle = ownerColor;
    ctx.fillText(ownerLabel, x + SIDEBAR_PANEL_PADDING + prefixWidth, lineY);
  }
};

const drawUnitInfo = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const panelWidth = SIDEBAR_WIDTH;
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);
  const x = viewportWidth - panelWidth;
  const height = 330;
  const y = viewportHeight - height;

  ctx.fillStyle = "rgba(15, 17, 22, 0.82)";
  ctx.fillRect(x, y, panelWidth, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y, panelWidth, height);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = `${SIDEBAR_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const hoveredUnit = state.units.find((unit) => unit.x === state.cursor.x && unit.y === state.cursor.y);

  let lineY = y + SIDEBAR_PANEL_PADDING;
  const lineHeight = SIDEBAR_LINE_HEIGHT;

  if (hoveredUnit) {
    const controller = state.config.controllers[hoveredUnit.faction] ?? "Human";
    const isPlayer = controller === "Human";
    const typeLabel = unitCatalog[hoveredUnit.type]?.name ?? hoveredUnit.type;

    ctx.fillStyle = isPlayer ? "#4dabf7" : "#ff6b6b";
    ctx.fillText(isPlayer ? "プレイヤー" : "エネミー", x + SIDEBAR_PANEL_PADDING, lineY);

    ctx.fillStyle = "#e7e7e7";
    lineY += lineHeight;
    ctx.fillText(`タイプ：${typeLabel}`, x + SIDEBAR_PANEL_PADDING, lineY);
    lineY += lineHeight;
    ctx.fillText(`レベル：${getLevelLabel(hoveredUnit)}`, x + SIDEBAR_PANEL_PADDING, lineY);
    lineY += lineHeight;
    ctx.fillText(`EXP：${hoveredUnit.exp}`, x + SIDEBAR_PANEL_PADDING, lineY);
    lineY += lineHeight;
    ctx.fillText(`食料：${hoveredUnit.food}`, x + SIDEBAR_PANEL_PADDING, lineY);
  }
};

const drawEnemyBudget = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  const enemyFaction = state.factions.find((faction) => {
    const controller = state.config.controllers[faction.id] ?? "Human";
    return controller === "CPU";
  })?.id;

  if (enemyFaction === undefined) {
    return;
  }

  const panelWidth = SIDEBAR_WIDTH;
  const viewportWidth = getViewportWidth(state.map);
  const viewportHeight = getViewportHeight(state.map);
  const x = viewportWidth - panelWidth;
  const topHeight = 200;
  const bottomHeight = 330;
  const gapTop = topHeight;
  const gapBottom = viewportHeight - bottomHeight;
  if (gapBottom <= gapTop) {
    return;
  }

  const y = Math.round((gapTop + gapBottom) / 2 - SIDEBAR_LINE_HEIGHT / 2);

  ctx.fillStyle = "rgba(15, 17, 22, 0.82)";
  ctx.fillRect(x, y - 6, panelWidth, SIDEBAR_LINE_HEIGHT + 12);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(x, y - 6, panelWidth, SIDEBAR_LINE_HEIGHT + 12);

  ctx.fillStyle = "#e7e7e7";
  ctx.font = `${SIDEBAR_FONT_SIZE}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`エネミー資金：${state.budgets[enemyFaction] ?? 0}`, x + SIDEBAR_PANEL_PADDING, y);
};

const drawIncomeResult = (ctx: CanvasRenderingContext2D, state: GameState): void => {
  if (!state.incomeResult) {
    return;
  }

  const frameWidth = getMapFrameWidth();
  const frameHeight = getMapFrameHeight();
  const panelWidth = Math.min(520, frameWidth - 80);
  const panelHeight = 240;
  const panelX = Math.round((frameWidth - panelWidth) / 2);
  const panelY = Math.round((frameHeight - panelHeight) / 2);

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  ctx.fillStyle = "rgba(15, 17, 22, 0.92)";
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  const result = state.incomeResult;
  const lineHeight = Math.round(SIDEBAR_LINE_HEIGHT * 1.05);
  let lineY = panelY + 22;

  const controller = state.config.controllers[result.factionId] ?? "Human";
  const isPlayer = controller === "Human";
  ctx.font = `${Math.round(SIDEBAR_FONT_SIZE * 1.05)}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = isPlayer ? "#4dabf7" : "#ff6b6b";
  ctx.fillText(isPlayer ? "プレイヤー" : "エネミー", panelX + 24, lineY);

  lineY += lineHeight;
  ctx.fillStyle = "#e7e7e7";
  ctx.fillText("■■ターンリザルト■■", panelX + 24, lineY);

  lineY += lineHeight * 1.3;
  ctx.fillText(`城×${result.castles}  +${result.castles * result.incomePerCastle}`, panelX + 24, lineY);
  lineY += lineHeight;
  ctx.fillText(`街×${result.towns}  +${result.towns * result.incomePerTown}`, panelX + 24, lineY);

  lineY += lineHeight * 1.2;
  ctx.fillText(`資金  ${result.before}  →  ${result.after}`, panelX + 24, lineY);

  ctx.fillStyle = "rgba(231, 231, 231, 0.7)";
  ctx.font = `${Math.round(SIDEBAR_FONT_SIZE * 0.9)}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("クリックで続行", panelX + panelWidth - 24, panelY + panelHeight - 28);
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

const getTerrainLabel = (type: TileType): string => {
  switch (type) {
    case TileType.Grass:
      return "草原";
    case TileType.Road:
      return "道路";
    case TileType.Forest:
      return "森";
    case TileType.Mountain:
      return "山";
    case TileType.Town:
      return "町";
    case TileType.Castle:
      return "城";
    default:
      return "草原";
  }
};

const getTerrainDefensePercent = (type: TileType): number => {
  switch (type) {
    case TileType.Forest:
    case TileType.Town:
      return 10;
    case TileType.Mountain:
    case TileType.Castle:
      return 20;
    case TileType.Grass:
    case TileType.Road:
    default:
      return 0;
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
