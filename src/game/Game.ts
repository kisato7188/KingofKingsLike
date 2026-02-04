import { Input } from "./Input";
import { getViewportHeight, getViewportWidth } from "./geometry";
import { render } from "./render";
import { TILE_SIZE } from "./constants";
import { clearSelection, createInitialState, handleTileClick, updateState, GameState } from "./state";
import { runCpuTurn } from "./ai/cpuController";

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
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  start(): void {
    requestAnimationFrame(this.loop);
  }

  private loop = (time: number): void => {
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(delta);
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(_delta: number): void {
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
  }

  private render(): void {
    render(this.ctx, this.state);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const position = this.getTilePosition(event);
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
    const position = this.getTilePosition(event);
    if (!position) {
      return;
    }
    this.state.cursor.x = position.x;
    this.state.cursor.y = position.y;

    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      return;
    }
    handleTileClick(this.state, position.x, position.y);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    const controller = this.state.config.controllers[this.state.turn.currentFaction] ?? "Human";
    if (controller !== "Human") {
      return;
    }
    clearSelection(this.state);
  };

  private getTilePosition(event: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const mapWidthPx = this.state.map.width * TILE_SIZE;
    const mapHeightPx = this.state.map.height * TILE_SIZE;

    if (localX < 0 || localY < 0 || localX >= mapWidthPx || localY >= mapHeightPx) {
      return null;
    }

    const x = Math.floor(localX / TILE_SIZE);
    const y = Math.floor(localY / TILE_SIZE);
    return { x, y };
  }
}
