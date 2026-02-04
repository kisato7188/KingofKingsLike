export type MoveCostFn = (x: number, y: number) => number;
export type PassableFn = (x: number, y: number) => boolean;

export type ReachableResult = {
  reachable: Set<number>;
  costs: Map<number, number>;
};

export type PathfindingOptions = {
  width: number;
  height: number;
  startX: number;
  startY: number;
  maxCost: number;
  isPassable: PassableFn;
  getMoveCost: MoveCostFn;
  toIndex: (x: number, y: number) => number;
};

export const findReachableTiles = (options: PathfindingOptions): ReachableResult => {
  const { width, height, startX, startY, maxCost, isPassable, getMoveCost, toIndex } = options;
  const reachable = new Set<number>();
  const costs = new Map<number, number>();
  const open: Array<{ x: number; y: number; cost: number }> = [];

  const startIndex = toIndex(startX, startY);
  costs.set(startIndex, 0);
  open.push({ x: startX, y: startY, cost: 0 });

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].cost < open[bestIndex].cost) {
        bestIndex = i;
      }
    }

    const current = open.splice(bestIndex, 1)[0];
    const currentIndex = toIndex(current.x, current.y);
    const knownCost = costs.get(currentIndex);
    if (knownCost === undefined || current.cost > knownCost) {
      continue;
    }

    if (current.cost > maxCost) {
      continue;
    }

    reachable.add(currentIndex);

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const next of neighbors) {
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) {
        continue;
      }
      if (!isPassable(next.x, next.y)) {
        continue;
      }

      const nextCost = current.cost + getMoveCost(next.x, next.y);
      if (nextCost > maxCost) {
        continue;
      }

      const nextIndex = toIndex(next.x, next.y);
      const prevCost = costs.get(nextIndex);
      if (prevCost === undefined || nextCost < prevCost) {
        costs.set(nextIndex, nextCost);
        open.push({ x: next.x, y: next.y, cost: nextCost });
      }
    }
  }

  return { reachable, costs };
};
