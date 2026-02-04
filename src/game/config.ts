import { FactionId } from "./types";

export type ControllerType = "Human" | "CPU";

export type GameConfig = {
  controllers: Record<FactionId, ControllerType>;
};

export const createDefaultConfig = (): GameConfig => ({
  controllers: {
    [FactionId.Blue]: "Human",
    [FactionId.Red]: "CPU",
    [FactionId.Yellow]: "CPU",
    [FactionId.Green]: "CPU",
  },
});
