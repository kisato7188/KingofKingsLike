import { Input } from "./Input";
import { getViewportHeight, getViewportWidth } from "./geometry";
import { render } from "./render";
import { createInitialState, updateState, GameState } from "./state";
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
}
