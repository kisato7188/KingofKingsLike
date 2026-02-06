import { Input } from "./Input";
import { getViewportHeight, getViewportWidth } from "./geometry";
import { render, UnitDrawPositions } from "./render";
import { TILE_SIZE } from "./constants";
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
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
};

const MOVE_SECONDS_PER_TILE = 0.3;
const MIN_MOVE_DURATION = 0.05;

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private state: GameState;
  private lastTime = 0;
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
    this.input.endFrame();
    this.syncUnitAnimations(previousPositions, delta);
  }

  private render(): void {
    render(this.ctx, this.state, this.getUnitDrawPositions());
  }

  private syncUnitAnimations(previousPositions: Map<number, { x: number; y: number }>, delta: number): void {
    for (const [unitId, anim] of this.unitAnimations.entries()) {
      anim.elapsed += delta;
      if (anim.elapsed >= anim.duration) {
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
      if (previous.x !== unit.x || previous.y !== unit.y) {
        const distance = Math.abs(unit.x - previous.x) + Math.abs(unit.y - previous.y);
        const duration = Math.max(MIN_MOVE_DURATION, distance * MOVE_SECONDS_PER_TILE);
        this.unitAnimations.set(unit.id, {
          fromX: previous.x,
          fromY: previous.y,
          toX: unit.x,
          toY: unit.y,
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
      const x = anim.fromX + (anim.toX - anim.fromX) * progress;
      const y = anim.fromY + (anim.toY - anim.fromY) * progress;
      positions.set(unit.id, { x, y });
    }
    return positions;
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const local = this.getLocalPosition(event);
    if (!local) {
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
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;

    if (localX < 0 || localY < 0 || localX >= mapWidthPx || localY >= mapHeightPx) {
      return null;
    }

    const x = Math.floor(localX / TILE_SIZE);
    const y = Math.floor(localY / TILE_SIZE);
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

    const unitX = unit.x * TILE_SIZE;
    const unitY = unit.y * TILE_SIZE;
    const menuWidth = 140;
    const rowHeight = 22;
    const menuHeight = 16 + options.length * rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const maxX = mapWidthPx - menuWidth - 8;
    const maxY = mapHeightPx - menuHeight - 8;
    const menuX = this.clamp(unitX + TILE_SIZE + 6, 8, maxX);
    const menuY = this.clamp(unitY - 6, 8, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + 8;
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

    const menuX = 16;
    const menuY = 16;
    const menuWidth = 220;
    const rowHeight = 22;
    const menuHeight = 16 + hireableUnits.length * rowHeight;

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + 8;
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
    const cursorX = anchor.x * TILE_SIZE;
    const cursorY = anchor.y * TILE_SIZE;
    const menuWidth = 140;
    const rowHeight = 22;
    const menuHeight = 16 + rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const maxX = mapWidthPx - menuWidth - 8;
    const maxY = mapHeightPx - menuHeight - 8;
    const menuX = this.clamp(cursorX + TILE_SIZE + 6, 8, maxX);
    const menuY = this.clamp(cursorY - 6, 8, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return false;
    }

    const itemTop = menuY + 8;
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

    const unitX = unit.x * TILE_SIZE;
    const unitY = unit.y * TILE_SIZE;
    const menuWidth = 140;
    const rowHeight = 22;
    const menuHeight = 16 + options.length * rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const maxX = mapWidthPx - menuWidth - 8;
    const maxY = mapHeightPx - menuHeight - 8;
    const menuX = this.clamp(unitX + TILE_SIZE + 6, 8, maxX);
    const menuY = this.clamp(unitY - 6, 8, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + 8;
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

    const menuX = 16;
    const menuY = 16;
    const menuWidth = 220;
    const rowHeight = 22;
    const menuHeight = 16 + hireableUnits.length * rowHeight;

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + 8;
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
    const cursorX = anchor.x * TILE_SIZE;
    const cursorY = anchor.y * TILE_SIZE;
    const menuWidth = 140;
    const rowHeight = 22;
    const menuHeight = 16 + rowHeight;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;
    const maxX = mapWidthPx - menuWidth - 8;
    const maxY = mapHeightPx - menuHeight - 8;
    const menuX = this.clamp(cursorX + TILE_SIZE + 6, 8, maxX);
    const menuY = this.clamp(cursorY - 6, 8, maxY);

    if (localX < menuX || localX > menuX + menuWidth || localY < menuY || localY > menuY + menuHeight) {
      return;
    }

    const itemTop = menuY + 8;
    if (localY >= itemTop && localY <= itemTop + rowHeight) {
      this.state.contextMenuIndex = 0;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
