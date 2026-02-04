import "./style.css";
import { Game } from "./game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error("Canvas element not found");
}

const game = new Game(canvas);

game.start();

const urlInput = document.getElementById("bgm-url") as HTMLInputElement | null;
const playButton = document.getElementById("bgm-play") as HTMLButtonElement | null;
const stopButton = document.getElementById("bgm-stop") as HTMLButtonElement | null;
const status = document.getElementById("bgm-status");

const audio = new Audio();
audio.loop = true;
audio.volume = 0.5;

const setStatus = (message: string): void => {
  if (status) {
    status.textContent = message;
  }
};

const playBgm = async (): Promise<void> => {
  const url = urlInput?.value.trim();
  if (!url) {
    setStatus("URL required");
    return;
  }
  if (audio.src !== url) {
    audio.src = url;
  }
  try {
    await audio.play();
    setStatus("Playing");
  } catch (error) {
    console.error(error);
    setStatus("Play failed");
  }
};

const stopBgm = (): void => {
  audio.pause();
  audio.currentTime = 0;
  setStatus("Stopped");
};

playButton?.addEventListener("click", () => {
  void playBgm();
});

stopButton?.addEventListener("click", () => {
  stopBgm();
});

urlInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void playBgm();
  }
});
