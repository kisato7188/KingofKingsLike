import "./style.css";
import { Game } from "./game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error("Canvas element not found");
}

const game = new Game(canvas);

game.start();

const turnEndButton = document.getElementById("turn-end-button") as HTMLButtonElement | null;
turnEndButton?.addEventListener("click", () => {
  game.requestEndTurn();
});

const baseUrl = import.meta.env.BASE_URL ?? "/";
const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const bgm = new Audio(`${normalizedBase}bgm.mp3`);
bgm.loop = true;
bgm.volume = 0.5;
bgm.preload = "auto";

const playButton = document.getElementById("bgm-play") as HTMLButtonElement | null;
const stopButton = document.getElementById("bgm-stop") as HTMLButtonElement | null;
const status = document.getElementById("bgm-status");

const setStatus = (message: string): void => {
  if (status) {
    status.textContent = message;
  }
};

const playBgm = async (): Promise<void> => {
  try {
    setStatus("再生中");
    await bgm.play();
  } catch (error) {
    console.error(error);
    setStatus("再生失敗");
  }
};

const stopBgm = (): void => {
  bgm.pause();
  bgm.currentTime = 0;
  setStatus("停止中");
};

playButton?.addEventListener("click", () => {
  void playBgm();
});

stopButton?.addEventListener("click", () => {
  stopBgm();
});

bgm.addEventListener("play", () => {
  setStatus("再生中");
});

bgm.addEventListener("pause", () => {
  if (bgm.currentTime === 0) {
    setStatus("停止中");
  }
});
