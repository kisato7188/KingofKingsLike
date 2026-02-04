export enum TileType {
  Grass = "Grass",
  Road = "Road",
  Forest = "Forest",
  Mountain = "Mountain",
  Town = "Town",
  Castle = "Castle",
}

export enum UnitType {
  King = "King",
  Fighter = "Fighter",
}

export enum FactionId {
  Red = 0,
  Blue = 1,
}

export type Tile = {
  type: TileType;
  ownerFaction?: FactionId | null;
};

export type MapData = {
  width: number;
  height: number;
  tiles: Tile[];
};

export type Unit = {
  id: number;
  type: UnitType;
  faction: FactionId;
  x: number;
  y: number;
  movePoints: number;
  food: number;
  acted: boolean;
};

export type Faction = {
  id: FactionId;
  name: string;
  color: string;
};

export type Scenario = {
  id: string;
  name: string;
  factions: Faction[];
  map: MapData;
  units: Unit[];
};
