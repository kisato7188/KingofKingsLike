const HANDLED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Space",
  "Escape",
  "Backspace",
  "KeyE",
  "KeyA",
  "KeyO",
  "KeyH",
  "KeyS",
  "KeyM",
]);

export class Input {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener("keydown", (event) => {
      if (HANDLED_KEYS.has(event.code)) {
        event.preventDefault();
      }

      if (!this.keysDown.has(event.code)) {
        this.keysPressed.add(event.code);
      }

      this.keysDown.add(event.code);
    });

    target.addEventListener("keyup", (event) => {
      if (HANDLED_KEYS.has(event.code)) {
        event.preventDefault();
      }

      this.keysDown.delete(event.code);
    });
  }

  isPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  endFrame(): void {
    this.keysPressed.clear();
  }
}
