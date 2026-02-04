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
    id: "heal",
    name: "Heal",
    targetType: "ally",
    range: 3,
    effect: (_caster, target) => {
      const amount = 8;
      return {
        ...target,
        hp: Math.min(target.maxHp, target.hp + amount),
      };
    },
  },
];
