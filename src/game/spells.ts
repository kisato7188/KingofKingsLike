import { Unit } from "./types";

export type SpellTargetType = "ally" | "enemy" | "self";

export type Spell = {
  id: string;
  name: string;
  targetType: SpellTargetType;
  range: number;
  effect: (caster: Unit, target: Unit) => Unit;
};

export const spells: Spell[] = [
  {
    id: "blast",
    name: "Blast",
    targetType: "enemy",
    range: 3,
    effect: (_caster, target) => {
      const amount = 6;
      return {
        ...target,
        hp: Math.max(0, target.hp - amount),
      };
    },
  },
];
