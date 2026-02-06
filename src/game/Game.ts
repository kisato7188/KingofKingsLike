import { Input } from "./Input";
import { getViewportHeight, getViewportWidth } from "./geometry";
import { MapView, render, UnitDrawPositions } from "./render";
import {
  ACTION_MENU_WIDTH,
  HIRE_MENU_WIDTH,
  MENU_EDGE_PADDING,
  MENU_ITEM_TOP,
  MENU_PADDING_Y,
  MENU_PANEL_MARGIN,
  MENU_ROW_HEIGHT,
  MENU_UNIT_OFFSET,
  TILE_SIZE,
} from "./constants";
import {
  applyActionMenuSelection,
  applyContextMenuSelection,
  applyHireMenuSelection,
  canHireUnitType,
  clearSelection,
  createInitialState,
  endTurn,
  getActionMenuOptions,
  handleTileClick,
  openContextMenu,
  updateState,
  GameState,
} from "./state";
import { runCpuTurn } from "./ai/cpuController";
import { hireableUnits } from "./unitCatalog";

type UnitAnimation = {
  path: Array<{ x: number; y: number }>;
  segmentIndex: number;
  elapsed: number;
  duration: number;
};

const MOVE_SECONDS_PER_TILE = 0.2;
const MIN_MOVE_DURATION = 0.05;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private state: GameState;
  private lastTime = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private lastPanPosition: { x: number; y: number } | null = null;
  private lastMousePosition: { x: number; y: number } | null = null;
  private readonly unitAnimations = new Map<number, UnitAnimation>();
  private readonly unitLastPositions = new Map<number, { x: number; y: number }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.state = createInitialState();
    this.canvas.width = getViewportWidth(this.state.map);
    this.canvas.height = getViewportHeight(this.state.map);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not supported");
    }

    this.ctx = ctx;
    this.input = new Input(window);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("mouseleave", this.handleMouseUp);

    for (const unit of this.state.units) {
      this.unitLastPositions.set(unit.id, { x: unit.x, y: unit.y });
    }
  }

  start(): void {
    requestAnimationFrame(this.loop);
  }

  requestEndTurn(): void {
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      return;
    }
    clearSelection(this.state);
    endTurn(this.state);
  }

  private loop = (time: number): void => {
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(delta);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(delta: number): void {
    const previousPositions = new Map(this.unitLastPositions);
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller === "CPU") {
      updateState(this.state, this.input, false);
      const updated = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
      if (updated === "CPU") {
        runCpuTurn(this.state);
      }
    } else {
      updateState(this.state, this.input, true);
    }
    this.handleZoomInput();
    this.handleEdgePan(delta);
    this.input.endFrame();
    this.syncUnitAnimations(previousPositions, delta);
  }

  private render(): void {
    render(this.ctx, this.state, this.getUnitDrawPositions(), this.getMapView());
  }

  private handleZoomInput(): void {
    if (this.input.isPressed("Equal") || this.input.isPressed("NumpadAdd")) {
      this.setZoom(this.zoom + ZOOM_STEP);
    }
    if (this.input.isPressed("Minus") || this.input.isPressed("NumpadSubtract")) {
      this.setZoom(this.zoom - ZOOM_STEP);
    }
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.deltaY === 0) {
      return;
    }
    const direction = Math.sign(event.deltaY);
    this.setZoom(this.zoom - direction * ZOOM_STEP);
  };

  private handleMouseUp = (): void => {
    this.isPanning = false;
    this.lastPanPosition = null;
  };

  private setZoom(value: number): void {
    this.zoom = this.clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.clampPan();
  }

  private getMapView(): MapView {
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const scaledWidth = mapWidthPx * this.zoom;
    const scaledHeight = mapHeightPx * this.zoom;
    const baseOffsetX = (mapWidthPx - scaledWidth) / 2;
    const baseOffsetY = (mapHeightPx - scaledHeight) / 2;
    const limitX = this.getPanLimits(mapWidthPx, scaledWidth);
    const limitY = this.getPanLimits(mapHeightPx, scaledHeight);
    const offsetX = this.clamp(baseOffsetX + this.panX, limitX.min, limitX.max);
    const offsetY = this.clamp(baseOffsetY + this.panY, limitY.min, limitY.max);
    return { zoom: this.zoom, offsetX, offsetY };
  }

  private getPanLimits(frameSize: number, scaledSize: number): { min: number; max: number } {
    const min = Math.min(0, frameSize - scaledSize);
    const max = Math.max(0, frameSize - scaledSize);
    return { min, max };
  }

  private clampPan(): void {
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const scaledWidth = mapWidthPx * this.zoom;
    const scaledHeight = mapHeightPx * this.zoom;
    const baseOffsetX = (mapWidthPx - scaledWidth) / 2;
    const baseOffsetY = (mapHeightPx - scaledHeight) / 2;
    const limitX = this.getPanLimits(mapWidthPx, scaledWidth);
    const limitY = this.getPanLimits(mapHeightPx, scaledHeight);
    const clampedOffsetX = this.clamp(baseOffsetX + this.panX, limitX.min, limitX.max);
    const clampedOffsetY = this.clamp(baseOffsetY + this.panY, limitY.min, limitY.max);
    this.panX = clampedOffsetX - baseOffsetX;
    this.panY = clampedOffsetY - baseOffsetY;
  }

  private adjustPan(deltaX: number, deltaY: number): void {
    this.panX += deltaX;
    this.panY += deltaY;
    this.clampPan();
  }

  private handleEdgePan(delta: number): void {
    if (!this.lastMousePosition || this.isPanning) {
      return;
    }

    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const edgeThreshold = 24;
    const speed = 360;
    const { x, y } = this.lastMousePosition;
    if (x < 0 || y < 0 || x > mapWidthPx || y > mapHeightPx) {
      return;
    }

    let deltaX = 0;
    let deltaY = 0;

    if (x <= edgeThreshold) {
      deltaX += speed * delta;
    } else if (x >= mapWidthPx - edgeThreshold) {
      deltaX -= speed * delta;
    }

    if (y <= edgeThreshold) {
      deltaY += speed * delta;
    } else if (y >= mapHeightPx - edgeThreshold) {
      deltaY -= speed * delta;
    }

    if (deltaX !== 0 || deltaY !== 0) {
      this.adjustPan(deltaX, deltaY);
    }
  }

  private getScreenPositionFromTile(x: number, y: number): { x: number; y: number } {
    const view = this.getMapView();
    const mapX = x * TILE_SIZE;
    const mapY = y * TILE_SIZE;
    return {
      x: view.offsetX + mapX * view.zoom,
      y: view.offsetY + mapY * view.zoom,
    };
  }

  private getMapLocalPosition(localX: number, localY: number): { x: number; y: number } | null {
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    if (localX < 0 || localY < 0 || localX >= mapWidthPx || localY >= mapHeightPx) {
      return null;
    }
    const view = this.getMapView();
    const mapX = (localX - view.offsetX) / view.zoom;
    const mapY = (localY - view.offsetY) / view.zoom;
    if (mapX < 0 || mapY < 0 || mapX >= mapWidthPx || mapY >= mapHeightPx) {
      return null;
    }
    return { x: mapX, y: mapY };
  }

  private syncUnitAnimations(previousPositions: Map<number, { x: number; y: number }>, delta: number): void {
    if (this.state.movementPaths.size > 0) {
      for (const [unitId, path] of this.state.movementPaths.entries()) {
        if (path.length >= 2) {
          this.unitAnimations.set(unitId, {
            path,
            segmentIndex: 0,
            elapsed: 0,
            duration: MOVE_SECONDS_PER_TILE,
          });
        }
      }
      this.state.movementPaths.clear();
    }

    for (const [unitId, anim] of this.unitAnimations.entries()) {
      anim.elapsed += delta;
      while (anim.elapsed >= anim.duration && anim.segmentIndex < anim.path.length - 2) {
        anim.elapsed -= anim.duration;
        anim.segmentIndex += 1;
      }
      if (anim.segmentIndex >= anim.path.length - 1) {
        this.unitAnimations.delete(unitId);
      }
    }

    const seenUnits = new Set<number>();

    for (const unit of this.state.units) {
      seenUnits.add(unit.id);
      const previous = previousPositions.get(unit.id);
      if (!previous) {
        this.unitLastPositions.set(unit.id, { x: unit.x, y: unit.y });
        continue;
      }
      if ((previous.x !== unit.x || previous.y !== unit.y) && !this.unitAnimations.has(unit.id)) {
        const distance = Math.abs(unit.x - previous.x) + Math.abs(unit.y - previous.y);
        const duration = Math.max(MIN_MOVE_DURATION, distance * MOVE_SECONDS_PER_TILE);
        this.unitAnimations.set(unit.id, {
          path: [
            { x: previous.x, y: previous.y },
            { x: unit.x, y: unit.y },
          ],
          segmentIndex: 0,
          elapsed: 0,
          duration,
        });
      }
      this.unitLastPositions.set(unit.id, { x: unit.x, y: unit.y });
    }

    for (const unitId of Array.from(this.unitLastPositions.keys())) {
      if (!seenUnits.has(unitId)) {
        this.unitLastPositions.delete(unitId);
        this.unitAnimations.delete(unitId);
      }
    }
  }

  private getUnitDrawPositions(): UnitDrawPositions {
    const positions: UnitDrawPositions = new Map();
    for (const unit of this.state.units) {
      const anim = this.unitAnimations.get(unit.id);
      if (!anim) {
        positions.set(unit.id, { x: unit.x, y: unit.y });
        continue;
      }
      const progress = Math.min(1, anim.elapsed / anim.duration);
      const from = anim.path[anim.segmentIndex] ?? { x: unit.x, y: unit.y };
      const to = anim.path[anim.segmentIndex + 1] ?? from;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      positions.set(unit.id, { x, y });
    }
    return positions;
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const local = this.getLocalPosition(event);
    if (!local) {
      return;
    }
    this.lastMousePosition = local;
    if (this.isPanning) {
      if (this.lastPanPosition) {
        const deltaX = local.x - this.lastPanPosition.x;
        const deltaY = local.y - this.lastPanPosition.y;
        this.adjustPan(deltaX, deltaY);
      }
      this.lastPanPosition = local;
      return;
    }
    if (this.state.actionMenuOpen) {
      this.updateActionMenuHover(local.x, local.y);
    }
    if (this.state.hireMenuOpen) {
      this.updateHireMenuHover(local.x, local.y);
    }
    if (this.state.contextMenuOpen) {
      this.updateContextMenuHover(local.x, local.y);
    }
    const position = this.getTilePositionFromLocal(local.x, local.y);
    if (!position) {
      return;
    }
    this.state.cursor.x = position.x;
    this.state.cursor.y = position.y;
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (event.button === 1) {
      event.preventDefault();
      const local = this.getLocalPosition(event);
      if (!local) {
        return;
      }
      this.isPanning = true;
      this.lastPanPosition = local;
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      return;
    }

    const local = this.getLocalPosition(event);
    if (!local) {
      return;
    }

    if (this.state.actionMenuOpen && this.handleActionMenuClick(local.x, local.y)) {
      return;
    }

    if (this.state.hireMenuOpen && this.handleHireMenuClick(local.x, local.y)) {
      return;
    }

    if (this.state.contextMenuOpen && this.handleContextMenuClick(local.x, local.y)) {
      return;
    }

    const position = this.getTilePositionFromLocal(local.x, local.y);
    if (!position) {
      return;
    }
    this.state.cursor.x = position.x;
    this.state.cursor.y = position.y;
    handleTileClick(this.state, position.x, position.y);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      return;
    }
    if (this.state.actionMenuOpen || this.state.hireMenuOpen || this.state.contextMenuOpen) {
      clearSelection(this.state);
      return;
    }
    const local = this.getLocalPosition(event);
    if (local) {
      const position = this.getTilePositionFromLocal(local.x, local.y);
      if (position) {
        this.state.cursor.x = position.x;
        this.state.cursor.y = position.y;
      }
    }
    clearSelection(this.state);
    const anchor = this.state.contextMenuAnchor
      ? { ...this.state.contextMenuAnchor }
      : { ...this.state.cursor };
    openContextMenu(this.state, anchor);
  };

  private getLocalPosition(event: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    if (rawX < 0 || rawY < 0 || rawX >= rect.width || rawY >= rect.height) {
      return null;
    }
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: rawX * scaleX, y: rawY * scaleY };
  }

  private getTilePositionFromLocal(localX: number, localY: number): { x: number; y: number } | null {
    const mapLocal = this.getMapLocalPosition(localX, localY);
    if (!mapLocal) {
      return null;
    }

    const x = Math.floor(mapLocal.x / TILE_SIZE);
    const y = Math.floor(mapLocal.y / TILE_SIZE);
    return { x, y };
  }

  private handleActionMenuClick(localX: number, localY: number): boolean {
    if (!this.state.actionMenuOpen || this.state.selectedUnitId === null || this.state.hireMenuOpen) {
      return false;
    }

    const unit = this.state.units.find((entry) => entry.id === this.state.selectedUnitId);
    if (!unit) {
      return false;
    }

    const options = getActionMenuOptions(this.state, unit);
    if (options.length === 0) {
      return false;
    }

    const view = this.getMapView();
    const screenPos = this.getScreenPositionFromTile(unit.x, unit.y);
    const menuWidth = ACTION_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + options.length * rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE * view.zoom;
    const mapHeightPx = this.state.map.height * TILE_SIZE * view.zoom;
    const minX = view.offsetX + MENU_EDGE_PADDING;
    const minY = view.offsetY + MENU_EDGE_PADDING;
    const maxX = view.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = view.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
    const menuX = this.clamp(screenPos.x + TILE_SIZE * view.zoom + MENU_UNIT_OFFSET, minX, maxX);
    const menuY = this.clamp(screenPos.y - MENU_UNIT_OFFSET, minY, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY < itemTop) {
      return true;
    }

    const index = Math.floor((localY - itemTop) / rowHeight);
    if (index < 0 || index >= options.length) {
      return true;
    }

    applyActionMenuSelection(this.state, index);
    return true;
  }

  private handleHireMenuClick(localX: number, localY: number): boolean {
    if (!this.state.hireMenuOpen || this.state.selectedUnitId === null) {
      return false;
    }

    const unit = this.state.units.find((entry) => entry.id === this.state.selectedUnitId);
    if (!unit) {
      return false;
    }

    const menuX = MENU_PANEL_MARGIN;
    const menuY = MENU_PANEL_MARGIN;
    const menuWidth = HIRE_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + hireableUnits.length * rowHeight;

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY < itemTop) {
      return true;
    }

    const index = Math.floor((localY - itemTop) / rowHeight);
    if (index < 0 || index >= hireableUnits.length) {
      return true;
    }

    const unitType = hireableUnits[index];
    if (!canHireUnitType(this.state, unit, unitType)) {
      this.state.hireSelectionIndex = index;
      return true;
    }

    applyHireMenuSelection(this.state, index);
    return true;
  }

  private handleContextMenuClick(localX: number, localY: number): boolean {
    if (!this.state.contextMenuOpen) {
      return false;
    }

    const anchor = this.state.contextMenuAnchor ?? this.state.cursor;
    const view = this.getMapView();
    const screenPos = this.getScreenPositionFromTile(anchor.x, anchor.y);
    const menuWidth = ACTION_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE * view.zoom;
    const mapHeightPx = this.state.map.height * TILE_SIZE * view.zoom;
    const minX = view.offsetX + MENU_EDGE_PADDING;
    const minY = view.offsetY + MENU_EDGE_PADDING;
    const maxX = view.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = view.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
    const menuX = this.clamp(screenPos.x + TILE_SIZE * view.zoom + MENU_UNIT_OFFSET, minX, maxX);
    const menuY = this.clamp(screenPos.y - MENU_UNIT_OFFSET, minY, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY < itemTop || localY > itemTop + rowHeight) {
      return true;
    }

    applyContextMenuSelection(this.state, 0);
    return true;
  }

  private updateActionMenuHover(localX: number, localY: number): void {
    if (!this.state.actionMenuOpen || this.state.selectedUnitId === null || this.state.hireMenuOpen) {
      return;
    }

    const unit = this.state.units.find((entry) => entry.id === this.state.selectedUnitId);
    if (!unit) {
      return;
    }

    const options = getActionMenuOptions(this.state, unit);
    if (options.length === 0) {
      return;
    }

    const view = this.getMapView();
    const screenPos = this.getScreenPositionFromTile(unit.x, unit.y);
    const menuWidth = ACTION_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + options.length * rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE * view.zoom;
    const mapHeightPx = this.state.map.height * TILE_SIZE * view.zoom;
    const minX = view.offsetX + MENU_EDGE_PADDING;
    const minY = view.offsetY + MENU_EDGE_PADDING;
    const maxX = view.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = view.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
    const menuX = this.clamp(screenPos.x + TILE_SIZE * view.zoom + MENU_UNIT_OFFSET, minX, maxX);
    const menuY = this.clamp(screenPos.y - MENU_UNIT_OFFSET, minY, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY < itemTop) {
      return;
    }

    const index = Math.floor((localY - itemTop) / rowHeight);
    if (index >= 0 && index < options.length) {
      this.state.actionMenuIndex = index;
    }
  }

  private updateHireMenuHover(localX: number, localY: number): void {
    if (!this.state.hireMenuOpen || this.state.selectedUnitId === null) {
      return;
    }

    const menuX = MENU_PANEL_MARGIN;
    const menuY = MENU_PANEL_MARGIN;
    const menuWidth = HIRE_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + hireableUnits.length * rowHeight;

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY < itemTop) {
      return;
    }

    const index = Math.floor((localY - itemTop) / rowHeight);
    if (index >= 0 && index < hireableUnits.length) {
      this.state.hireSelectionIndex = index;
    }
  }

  private updateContextMenuHover(localX: number, localY: number): void {
    if (!this.state.contextMenuOpen) {
      return;
    }

    const anchor = this.state.contextMenuAnchor ?? this.state.cursor;
    const view = this.getMapView();
    const screenPos = this.getScreenPositionFromTile(anchor.x, anchor.y);
    const menuWidth = ACTION_MENU_WIDTH;
    const rowHeight = MENU_ROW_HEIGHT;
    const menuHeight = MENU_PADDING_Y + rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE * view.zoom;
    const mapHeightPx = this.state.map.height * TILE_SIZE * view.zoom;
    const minX = view.offsetX + MENU_EDGE_PADDING;
    const minY = view.offsetY + MENU_EDGE_PADDING;
    const maxX = view.offsetX + mapWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = view.offsetY + mapHeightPx - menuHeight - MENU_EDGE_PADDING;
    const menuX = this.clamp(screenPos.x + TILE_SIZE * view.zoom + MENU_UNIT_OFFSET, minX, maxX);
    const menuY = this.clamp(screenPos.y - MENU_UNIT_OFFSET, minY, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + MENU_ITEM_TOP;
    if (localY >= itemTop && localY <= itemTop + rowHeight) {
      this.state.contextMenuIndex = 0;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
