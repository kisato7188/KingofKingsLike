import { Input } from "./Input";
import { getMapFrameHeight, getMapFrameWidth, getViewportHeight, getViewportWidth } from "./geometry";
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
  confirmIncomeResult,
  createInitialState,
  endTurn,
  getActionMenuOptions,
  handleTileClick,
  openContextMenu,
  updateState,
  GameState,
  UiEffect,
} from "./state";
import { runCpuTurnStep } from "./ai/cpuController";
import { hireableUnits } from "./unitCatalog";
import { UnitType } from "./types";

type UnitAnimation = {
  path: Array<{ x: number; y: number }>;
  segmentIndex: number;
  elapsed: number;
  duration: number;
};

const MOVE_SECONDS_PER_TILE = 0.2;
const MIN_MOVE_DURATION = 0.05;
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const EFFECT_DURATION = 1.5;
const CPU_STEP_DELAY = 1;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private state: GameState;
  private lastTime = 0;

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
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("mouseleave", this.handleMouseLeave);
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
    this.autoMode = false;
    clearSelection(this.state);
    endTurn(this.state);
  }

  toggleAutoMode(): boolean {
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      this.autoMode = false;
      return this.autoMode;
    }
    this.autoMode = !this.autoMode;
    if (!this.autoMode) {
      this.cpuFocusUnitId = null;
      this.cpuActionCooldown = 0;
    }
    return this.autoMode;
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
    if (controller === "CPU" && this.state.incomeResult) {
      confirmIncomeResult(this.state);
    }
    const effectBlocking =
      this.activeEffect !== null ||
      this.state.uiEffects.length > 0 ||
      this.unitAnimations.size > 0 ||
      this.state.incomeResult !== null ||
      this.effectCooldown > 0;
    if (controller === "CPU") {
      this.autoMode = false;
      updateState(this.state, this.input, false);
      const updated = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
      if (updated === "CPU") {
        this.cpuActionCooldown = Math.max(0, this.cpuActionCooldown - delta);
        if (!effectBlocking && this.cpuActionCooldown <= 0) {
          const result = runCpuTurnStep(this.state, {
            lockKingOnCastle: true,
          });
          if (result.focusUnitId !== undefined) {
            this.cpuFocusUnitId = result.focusUnitId;
            const focusUnit = this.state.units.find((unit) => unit.id === result.focusUnitId);
            if (focusUnit) {
              this.state.cursor.x = focusUnit.x;
              this.state.cursor.y = focusUnit.y;
            }
          }
          if (result.acted) {
            this.cpuActionCooldown = CPU_STEP_DELAY;
          }
          if (result.turnEnded) {
            this.cpuFocusUnitId = null;
          }
        }
      }
    } else {
      updateState(this.state, this.input, true);
      if (this.autoMode) {
        this.cpuActionCooldown = Math.max(0, this.cpuActionCooldown - delta);
        if (!effectBlocking && this.cpuActionCooldown <= 0) {
          const result = runCpuTurnStep(this.state, {
            factionId: this.state.turn.currentFaction,
            skipUnit: (unit) => unit.type === UnitType.King,
            allowEndTurn: false,
            allowHire: false,
          });
          if (result.focusUnitId !== undefined) {
            this.cpuFocusUnitId = result.focusUnitId;
          }
          if (result.acted) {
            this.cpuActionCooldown = CPU_STEP_DELAY;
          } else {
            this.autoMode = false;
            this.cpuFocusUnitId = null;
          }
        }
      } else {
        this.cpuActionCooldown = 0;
        this.cpuFocusUnitId = null;
      }
    }
    this.handleZoomInput();
    this.handleEdgePan(delta);
    this.input.endFrame();
    this.syncUnitAnimations(previousPositions, delta);
    this.updateEffects(delta);
    this.updatePlayerTurnFocus(controller);
    this.updateCpuCameraFocus();
  }

  private updatePlayerTurnFocus(controller: string): void {
    const currentFaction = this.state.turn.currentFaction;
    const turnChanged = this.lastTurnFaction !== currentFaction || this.lastTurnController !== controller;
    this.lastTurnFaction = currentFaction;
    this.lastTurnController = controller;

    if (!turnChanged || controller !== "Human") {
      return;
    }

    const king = this.state.units.find(
      (unit) => unit.faction === currentFaction && unit.type === UnitType.King,
    );
    if (!king) {
      return;
    }
    this.centerOnMapPosition(king.x * TILE_SIZE + TILE_SIZE / 2, king.y * TILE_SIZE + TILE_SIZE / 2);
  }

  private render(): void {
    render(
      this.ctx,
      this.state,
      this.getUnitDrawPositions(),
      this.getMapView(),
      this.getEffectState(),
      new Set(this.unitAnimations.keys()),
    );
  }

  private updateEffects(delta: number): void {
    if (this.effectCooldown > 0) {
      this.effectCooldown = Math.max(0, this.effectCooldown - delta);
      return;
    }
    if (this.unitAnimations.size > 0) {
      return;
    }
    if (!this.activeEffect && this.state.uiEffects.length > 0) {
      this.activeEffect = this.state.uiEffects.shift() ?? null;
      this.effectElapsed = 0;
      this.activeEffectDuration = this.activeEffect ? this.getEffectDuration(this.activeEffect) : EFFECT_DURATION;
    }

    if (!this.activeEffect) {
      return;
    }

    this.effectElapsed += delta;
    if (this.effectElapsed >= this.activeEffectDuration) {
      if (this.activeEffect?.kind === "attack") {
        this.effectCooldown = 1;
      }
      this.activeEffect = null;
      this.effectElapsed = 0;
      this.activeEffectDuration = EFFECT_DURATION;
    }
  }

  private getEffectState(): { effect: UiEffect; elapsed: number; duration: number } | null {
    if (!this.activeEffect) {
      return null;
    }
    return { effect: this.activeEffect, elapsed: this.effectElapsed, duration: this.activeEffectDuration };
  }

  private getEffectDuration(effect: UiEffect): number {
    if (effect.kind === "hire") {
      return 0.6;
    }
    return EFFECT_DURATION;
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const scaledWidth = mapWidthPx * this.zoom;
    const scaledHeight = mapHeightPx * this.zoom;
    const baseOffsetX = (frameWidthPx - scaledWidth) / 2;
    const baseOffsetY = (frameHeightPx - scaledHeight) / 2;
    const limitX = this.getPanLimits(frameWidthPx, scaledWidth);
    const limitY = this.getPanLimits(frameHeightPx, scaledHeight);
    const offsetX = this.clamp(baseOffsetX + this.panX, limitX.min, limitX.max);
    const offsetY = this.clamp(baseOffsetY + this.panY, limitY.min, limitY.max);
    return { zoom: this.zoom, offsetX, offsetY };
  }

  private getPanLimits(frameSize: number, scaledSize: number): { min: number; max: number } {
    const overscroll = TILE_SIZE * 2;
    const min = Math.min(0, frameSize - scaledSize) - overscroll;
    const max = Math.max(0, frameSize - scaledSize) + overscroll;
    return { min, max };
  }

  private clampPan(): void {
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const scaledWidth = mapWidthPx * this.zoom;
    const scaledHeight = mapHeightPx * this.zoom;
    const baseOffsetX = (frameWidthPx - scaledWidth) / 2;
    const baseOffsetY = (frameHeightPx - scaledHeight) / 2;
    const limitX = this.getPanLimits(frameWidthPx, scaledWidth);
    const limitY = this.getPanLimits(frameHeightPx, scaledHeight);
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

  private updateCpuCameraFocus(): void {
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if ((controller !== "CPU" && !this.autoMode) || this.cpuFocusUnitId === null) {
      return;
    }
    const position = this.getUnitDrawPosition(this.cpuFocusUnitId);
    if (!position) {
      return;
    }
    const focusUnit = this.state.units.find((unit) => unit.id === this.cpuFocusUnitId);
    if (focusUnit) {
      this.state.cursor.x = focusUnit.x;
      this.state.cursor.y = focusUnit.y;
    }
    this.centerOnMapPosition(position.x * TILE_SIZE + TILE_SIZE / 2, position.y * TILE_SIZE + TILE_SIZE / 2);
  }

  private centerOnMapPosition(mapX: number, mapY: number): void {
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const scaledX = mapX * this.zoom;
    const scaledY = mapY * this.zoom;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const scaledWidth = mapWidthPx * this.zoom;
    const scaledHeight = mapHeightPx * this.zoom;
    const baseOffsetX = (frameWidthPx - scaledWidth) / 2;
    const baseOffsetY = (frameHeightPx - scaledHeight) / 2;
    const desiredOffsetX = frameWidthPx / 2 - scaledX;
    const desiredOffsetY = frameHeightPx / 2 - scaledY;
    this.panX = desiredOffsetX - baseOffsetX;
    this.panY = desiredOffsetY - baseOffsetY;
    this.clampPan();
  }

  private handleEdgePan(delta: number): void {
    if (!this.lastMousePosition || this.isPanning) {
      return;
    }

    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const edgeThreshold = 24;
    const speed = 360;
    const { x, y } = this.lastMousePosition;
    if (x < 0 || y < 0 || x > frameWidthPx || y > frameHeightPx) {
      return;
    }

    let deltaX = 0;
    let deltaY = 0;

    if (x <= edgeThreshold) {
      deltaX += speed * delta;
    } else if (x >= frameWidthPx - edgeThreshold) {
      deltaX -= speed * delta;
    }

    if (y <= edgeThreshold) {
      deltaY += speed * delta;
    } else if (y >= frameHeightPx - edgeThreshold) {
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    if (localX < 0 || localY < 0 || localX >= frameWidthPx || localY >= frameHeightPx) {
      return null;
    }
    const view = this.getMapView();
    const mapX = (localX - view.offsetX) / view.zoom;
    const mapY = (localY - view.offsetY) / view.zoom;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
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
      while (anim.elapsed >= anim.duration) {
        if (anim.segmentIndex < anim.path.length - 2) {
          anim.elapsed -= anim.duration;
          anim.segmentIndex += 1;
        } else {
          this.unitAnimations.delete(unitId);
          break;
        }
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

  private getUnitDrawPosition(unitId: number): { x: number; y: number } | null {
    const unit = this.state.units.find((entry) => entry.id === unitId);
    if (!unit) {
      return null;
    }
    const anim = this.unitAnimations.get(unitId);
    if (!anim) {
      return { x: unit.x, y: unit.y };
    }
    const progress = Math.min(1, anim.elapsed / anim.duration);
    const from = anim.path[anim.segmentIndex] ?? { x: unit.x, y: unit.y };
    const to = anim.path[anim.segmentIndex + 1] ?? from;
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (this.isDragging) {
      const deltaX = event.clientX - this.dragStartX;
      const deltaY = event.clientY - this.dragStartY;
      
      // Check if user has moved enough to consider it a drag
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        this.hasDragged = true;
      }
      
      // Update scroll position on the body element
      document.body.scrollLeft = this.dragScrollLeft - deltaX;
      document.body.scrollTop = this.dragScrollTop - deltaY;
      return;
    }

    const local = this.getLocalPosition(event);
    if (!local) {
      return;
    }
    this.lastMousePosition = local;
    if (this.state.incomeResult) {
      return;
    }
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
    if (this.state.incomeResult) {
      if (event.button === 0) {
        confirmIncomeResult(this.state);
      }
    if (this.autoMode) {
      this.lastMousePosition = local;
      return;
    }
      return;
    }
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

    // Initialize drag state
    this.isDragging = true;
    this.hasDragged = false;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragScrollLeft = document.body.scrollLeft;
    this.dragScrollTop = document.body.scrollTop;
    this.canvas.style.cursor = 'grabbing';
  };

  private handleMouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    this.isDragging = false;
    this.canvas.style.cursor = 'grab';

    // If the user didn't drag, treat it as a click
    if (!this.hasDragged) {
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
    }
  };

  private handleMouseLeave = (): void => {
    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    }
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const minX = MENU_EDGE_PADDING;
    const minY = MENU_EDGE_PADDING;
    const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const minX = MENU_EDGE_PADDING;
    const minY = MENU_EDGE_PADDING;
    const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const minX = MENU_EDGE_PADDING;
    const minY = MENU_EDGE_PADDING;
    const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
    const frameWidthPx = getMapFrameWidth();
    const frameHeightPx = getMapFrameHeight();
    const minX = MENU_EDGE_PADDING;
    const minY = MENU_EDGE_PADDING;
    const maxX = frameWidthPx - menuWidth - MENU_EDGE_PADDING;
    const maxY = frameHeightPx - menuHeight - MENU_EDGE_PADDING;
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
