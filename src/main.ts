import "./style.css";
import { Game } from "./game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error("Canvas element not found");
}

const game = new Game(canvas);

game.start();

const bgm = new Audio("/bgm.mp3");
bgm.loop = true;
bgm.volume = 0.5;
bgm.preload = "auto";

const tryStartBgm = (): void => {
  void bgm.play();
  window.removeEventListener("pointerdown", tryStartBgm);
};

window.addEventListener("pointerdown", tryStartBgm, { once: true });
