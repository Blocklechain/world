import { Client, type Room } from "colyseus.js";

import type { SkillXp } from "@world/content";
import { DEFAULT_ZONE, EVT, MSG } from "@world/shared";

export interface ChatLine {
  from?: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface XpDrop {
  skill: string;
  xp: number;
  total: number;
  level: number;
  ts: number;
}

export interface QuestProgress {
  n: number;
  state: "active" | "done" | "claimed";
}

export interface NpcPayload {
  id: string;
  name: string;
  role: string;
  lines: string[];
  banker: boolean;
  quest: {
    id: string;
    name: string;
    intro: string;
    done: string;
    objective: { kind: "gather" | "kill"; target: string; count: number };
    reward: { skill: string; xp: number };
    state: "none" | "active" | "done" | "claimed";
    n: number;
  } | null;
}

export interface GameState {
  address: string | null;
  skills: SkillXp | null;
  inv: (string | null)[];
  bankOpen: boolean;
  bank: Record<string, number>;
  quests: Record<string, QuestProgress>;
}

type Listener = () => void;

export interface FxEvent {
  kind: "attack" | "monsterAttack";
  style?: "melee" | "archery" | "magic";
  sid?: string;
  monsterId?: string;
  dmg: number;
}

export interface Net {
  room: Room;
  sessionId: string;
  game: GameState;
  sendMove(x: number, z: number): void;
  sendChat(text: string): void;
  interact(nodeId: string): void;
  attack(monsterId: string, style: string): void;
  onFx(cb: (e: FxEvent) => void): void;
  npcTalk(npcId: string): void;
  questAccept(questId: string): void;
  questComplete(questId: string): void;
  onNpc(cb: (npc: NpcPayload) => void): void;
  craft(recipeId: string): void;
  equip(slot: number): void;
  unequip(): void;
  eat(slot: number): void;
  dropSlot(slot: number): void;
  bankOpen(): void;
  bankDeposit(slot: number, all?: boolean): void;
  bankWithdraw(itemId: string, qty?: number): void;
  onChat(cb: (line: ChatLine) => void): void;
  onXp(cb: (drop: XpDrop) => void): void;
  onMsg(cb: (text: string) => void): void;
  onDepletedChange(cb: Listener): void;
  onGameChange(cb: Listener): void;
  isDepleted(nodeId: string): boolean;
}

export async function connect(name: string, token: string | null): Promise<Net> {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const client = new Client(`${proto}://${location.host}/colyseus`);
  const room = await client.joinOrCreate("zone", { zone: DEFAULT_ZONE, name, token });

  const game: GameState = { address: null, skills: null, inv: [], bankOpen: false, bank: {}, quests: {} };
  const chatCbs: ((l: ChatLine) => void)[] = [];
  const xpCbs: ((d: XpDrop) => void)[] = [];
  const msgCbs: ((t: string) => void)[] = [];
  const depletedCbs: Listener[] = [];
  const gameCbs: Listener[] = [];
  const emitGame = () => gameCbs.forEach((cb) => cb());

  room.onMessage(EVT.chat, (m: ChatLine) => chatCbs.forEach((cb) => cb(m)));
  room.onMessage(EVT.system, (m: { text: string }) =>
    chatCbs.forEach((cb) => cb({ text: m.text, ts: Date.now(), system: true })),
  );
  room.onMessage(EVT.profile, (m: { address: string; skills: SkillXp; inv: (string | null)[] }) => {
    game.address = m.address;
    game.skills = m.skills;
    game.inv = m.inv;
    emitGame();
  });
  room.onMessage(EVT.inv, (m: { inv: (string | null)[] }) => {
    game.inv = m.inv;
    emitGame();
  });
  room.onMessage(EVT.xp, (m: Omit<XpDrop, "ts">) => {
    if (game.skills) game.skills[m.skill as keyof SkillXp] = m.total;
    xpCbs.forEach((cb) => cb({ ...m, ts: Date.now() }));
    emitGame();
  });
  room.onMessage(EVT.bank, (m: { open: boolean; entries?: Record<string, number> }) => {
    game.bankOpen = m.open;
    if (m.entries) game.bank = m.entries;
    emitGame();
  });
  room.onMessage(EVT.msg, (m: { text: string }) => msgCbs.forEach((cb) => cb(m.text)));
  const fxCbs: ((e: FxEvent) => void)[] = [];
  room.onMessage("fx", (e: FxEvent) => fxCbs.forEach((cb) => cb(e)));
  const npcCbs: ((n: NpcPayload) => void)[] = [];
  room.onMessage("npc", (m: { npc: NpcPayload }) => npcCbs.forEach((cb) => cb(m.npc)));
  room.onMessage("quests", (m: { quests: Record<string, QuestProgress> }) => {
    game.quests = m.quests;
    emitGame();
  });

  // depleted-node set lives in shared room state
  const depleted = () =>
    (room.state as { depleted?: Map<string, number> }).depleted ?? new Map<string, number>();
  room.onStateChange(() => depletedCbs.forEach((cb) => cb()));

  return {
    room,
    sessionId: room.sessionId,
    game,
    sendMove: (x, z) => room.send(MSG.move, { x, z }),
    sendChat: (text) => room.send(MSG.chat, { text }),
    interact: (nodeId) => room.send(MSG.interact, { nodeId }),
    attack: (monsterId, style) => room.send("attack", { monsterId, style }),
    onFx: (cb) => fxCbs.push(cb),
    npcTalk: (npcId) => room.send("npc:talk", { npcId }),
    questAccept: (questId) => room.send("quest:accept", { questId }),
    questComplete: (questId) => room.send("quest:complete", { questId }),
    onNpc: (cb) => npcCbs.push(cb),
    craft: (recipeId) => room.send("craft", { recipeId }),
    equip: (slot) => room.send("equip", { slot }),
    unequip: () => room.send("unequip"),
    eat: (slot) => room.send("eat", { slot }),
    dropSlot: (slot) => room.send(MSG.invDrop, { slot }),
    bankOpen: () => room.send(MSG.bankOpen),
    bankDeposit: (slot, all) => room.send(MSG.bankDeposit, { slot, all }),
    bankWithdraw: (itemId, qty) => room.send(MSG.bankWithdraw, { itemId, qty }),
    onChat: (cb) => chatCbs.push(cb),
    onXp: (cb) => xpCbs.push(cb),
    onMsg: (cb) => msgCbs.push(cb),
    onDepletedChange: (cb) => depletedCbs.push(cb),
    onGameChange: (cb) => gameCbs.push(cb),
    isDepleted: (nodeId) => depleted().has(nodeId),
  };
}

export interface AuthResult {
  token: string;
  address: string;
  name: string;
  hasAppearance?: boolean;
}

export async function apiAppearance(token: string, appearance: unknown): Promise<void> {
  await apiPost("/api/auth/appearance", { token, appearance });
}

export async function apiRegister(email: string, password: string, name: string): Promise<AuthResult> {
  return apiPost("/api/auth/register", { email, password, name });
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  return apiPost("/api/auth/login", { email, password });
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
