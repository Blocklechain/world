/** Wire protocol shared by client and server. Server is authoritative. */

export const TICK_RATE = 20; // Hz
export const TICK_MS = 1000 / TICK_RATE;
export const INTERP_MS = 100; // client render delay for remote entities
export const ZONE_SHARD_CAP = 150; // players per zone instance

export const WALK_SPEED = 2.2; // m/s
export const RUN_SPEED = 4.4; // m/s

/** v1 zones. Lore: the fallen kingdom of Veyra on the continent of Aldermoor. */
export const ZONES = {
  hearthmere: { name: "Hearthmere", kind: "town", size: 96 }, // safe starter town
  thornfell: { name: "Thornfell Forest", kind: "field", size: 160 }, // lv 1–15
  gloamdeep: { name: "Gloamdeep Mine", kind: "cavern", size: 128 }, // lv 10–25
  sunken_keep: { name: "The Sunken Keep", kind: "dungeon", size: 112 }, // lv 20–30
} as const;
export type ZoneId = keyof typeof ZONES;
export const DEFAULT_ZONE: ZoneId = "hearthmere";

/** Client -> server messages (Colyseus message types). */
export const MSG = {
  move: "move", // { x: number, z: number } tap-to-move target
  chat: "chat", // { text: string }
  stop: "stop", // {}
} as const;

/** Server -> client broadcast types. */
export const EVT = {
  chat: "chat", // { from: string, text: string, ts: number }
  system: "system", // { text: string }
} as const;

export interface MoveMsg {
  x: number;
  z: number;
}
export interface ChatMsg {
  text: string;
}
export const CHAT_MAX_LEN = 240;
