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
audio.preload = "auto";
audio.crossOrigin = "anonymous";
audio.loop = true;
audio.volume = 0.5;

const setStatus = (message: string): void => {
  if (status) {
    status.textContent = message;
  }
};

const describeAudioError = (error: MediaError | null): string => {
  if (!error) {
    return "Play failed";
  }
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "Aborted";
    case MediaError.MEDIA_ERR_NETWORK:
      return "Network error";
    case MediaError.MEDIA_ERR_DECODE:
      return "Decode error";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Format not supported";
    default:
      return "Play failed";
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
    audio.load();
  }
  try {
    setStatus("Loading...");
    await audio.play();
    setStatus("Playing");
  } catch (error) {
    console.error(error);
    setStatus("Play failed (gesture or blocked)");
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

audio.addEventListener("error", () => {
  setStatus(describeAudioError(audio.error));
});

audio.addEventListener("stalled", () => {
  setStatus("Stalled");
});
