import { Client, type Room } from "colyseus.js";

import { DEFAULT_ZONE, EVT, MSG, type ZoneId } from "@world/shared";

export interface ChatLine {
  from?: string;
  text: string;
  ts: number;
  system?: boolean;
}

export interface Net {
  room: Room;
  sessionId: string;
  sendMove(x: number, z: number): void;
  sendChat(text: string): void;
  onChat(cb: (line: ChatLine) => void): void;
}

export async function connect(name: string, zone: ZoneId = DEFAULT_ZONE): Promise<Net> {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const client = new Client(`${proto}://${location.host}/colyseus`);
  const room = await client.joinOrCreate("zone", { zone, name });

  const chatCbs: ((line: ChatLine) => void)[] = [];
  room.onMessage(EVT.chat, (m: { from: string; text: string; ts: number }) =>
    chatCbs.forEach((cb) => cb(m)),
  );
  room.onMessage(EVT.system, (m: { text: string }) =>
    chatCbs.forEach((cb) => cb({ text: m.text, ts: Date.now(), system: true })),
  );

  return {
    room,
    sessionId: room.sessionId,
    sendMove: (x, z) => room.send(MSG.move, { x, z }),
    sendChat: (text) => room.send(MSG.chat, { text }),
    onChat: (cb) => chatCbs.push(cb),
  };
}
