import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  GATHER_TICK_MS,
  encodeLook,
  randomLook,
  ITEMS,
  NODE_SPECIES,
  SPAWN,
  allNodes,
  gatherChance,
  isWalkable,
  moveStateAt,
  SWIM_SPEED_MULT,
  levelForXp,
  type WorldNode,
} from "@world/content";
import {
  CHAT_MAX_LEN,
  EVT,
  MSG,
  RUN_SPEED,
  TICK_MS,
  ZONE_SHARD_CAP,
  type ChatMsg,
  type MoveMsg,
} from "@world/shared";

import { accountByAddress } from "../accounts.js";
import * as auth from "../auth.js";
import { freeSlot, loadProfile, touchProfile, type Profile } from "../profiles.js";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") heading = 0;
  @type("float32") tx = 0;
  @type("float32") tz = 0;
  @type("boolean") moving = false;
  /** idle | chop | mine | swim */
  @type("string") action = "idle";
  /** race:sex:hair:hairColor:beard */
  @type("string") look = "";
}

export class ZoneState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** nodeId -> ms timestamp when it respawns */
  @type({ map: "number" }) depleted = new MapSchema<number>();
}

interface Session {
  profile: Profile;
  gatherNode: string | null;
  nextGatherAt: number;
  bankOpen: boolean;
}

const BANK_POS = { x: SPAWN.x + 10, z: SPAWN.z - 6, radius: 5 };

/** The seamless overworld. Caves/dungeons get their own room types later. */
export class ZoneRoom extends Room<ZoneState> {
  maxClients = ZONE_SHARD_CAP;
  nodes: Map<string, WorldNode> = allNodes();
  sessions = new Map<string, Session>();

  async onAuth(_client: Client, options: { token?: string }) {
    // wallet session if presented; guests allowed during the greybox phase
    const address = auth.sessionAddress(options?.token);
    return { address };
  }

  onCreate() {
    this.setState(new ZoneState());
    this.setPatchRate(TICK_MS);
    console.log(`[world] overworld up — ${this.nodes.size} resource nodes`);

    this.onMessage(MSG.move, (client, msg: MoveMsg) => {
      const p = this.state.players.get(client.sessionId);
      const s = this.sessions.get(client.sessionId);
      if (!p || !s || typeof msg?.x !== "number" || typeof msg?.z !== "number") return;
      if (!isWalkable(msg.x, msg.z)) return;
      this.stopGathering(client.sessionId, p);
      p.tx = msg.x;
      p.tz = msg.z;
      p.moving = true;
      if (s.bankOpen) {
        s.bankOpen = false;
        client.send("bank", { open: false });
      }
    });

    this.onMessage(MSG.stop, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.moving = false;
    });

    this.onMessage(MSG.chat, (client, msg: ChatMsg) => {
      const p = this.state.players.get(client.sessionId);
      const text = String(msg?.text ?? "").slice(0, CHAT_MAX_LEN).trim();
      if (!p || !text) return;
      this.broadcast(EVT.chat, { from: p.name, text, ts: Date.now() });
    });

    this.onMessage("interact", (client, msg: { nodeId?: string }) => {
      this.handleInteract(client, String(msg?.nodeId ?? ""));
    });

    this.onMessage("inv:drop", (client, msg: { slot?: number }) => {
      const s = this.sessions.get(client.sessionId);
      const slot = Number(msg?.slot);
      if (!s || !Number.isInteger(slot) || slot < 0 || slot >= s.profile.inv.length) return;
      if (s.profile.inv[slot] === null) return;
      s.profile.inv[slot] = null;
      touchProfile(s.profile.address);
      client.send("inv", { inv: s.profile.inv });
    });

    this.onMessage("bank:open", (client) => {
      const p = this.state.players.get(client.sessionId);
      const s = this.sessions.get(client.sessionId);
      if (!p || !s) return;
      if (Math.hypot(p.x - BANK_POS.x, p.z - BANK_POS.z) > BANK_POS.radius) {
        client.send("msg", { text: "You need to be at the bank booth." });
        return;
      }
      s.bankOpen = true;
      client.send("bank", { open: true, entries: s.profile.bank });
    });

    this.onMessage("bank:deposit", (client, msg: { slot?: number; all?: boolean }) => {
      const s = this.sessions.get(client.sessionId);
      if (!s?.bankOpen) return;
      const p = s.profile;
      const depositSlot = (slot: number) => {
        const id = p.inv[slot];
        if (!id) return;
        p.bank[id] = (p.bank[id] ?? 0) + 1;
        p.inv[slot] = null;
      };
      const slot = Number(msg?.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= p.inv.length) return;
      const id = p.inv[slot];
      if (!id) return;
      if (msg?.all) {
        for (let i = 0; i < p.inv.length; i++) if (p.inv[i] === id) depositSlot(i);
      } else {
        depositSlot(slot);
      }
      touchProfile(p.address);
      client.send("inv", { inv: p.inv });
      client.send("bank", { open: true, entries: p.bank });
    });

    this.onMessage("bank:withdraw", (client, msg: { itemId?: string; qty?: number }) => {
      const s = this.sessions.get(client.sessionId);
      if (!s?.bankOpen) return;
      const p = s.profile;
      const itemId = String(msg?.itemId ?? "");
      if (!ITEMS[itemId] || (p.bank[itemId] ?? 0) <= 0) return;
      let qty = Math.max(1, Math.min(Number(msg?.qty) || 1, p.bank[itemId]!));
      while (qty > 0) {
        const slot = freeSlot(p);
        if (slot < 0) {
          client.send("msg", { text: "Your pack is full." });
          break;
        }
        p.inv[slot] = itemId;
        p.bank[itemId]!--;
        qty--;
      }
      if (p.bank[itemId] === 0) delete p.bank[itemId];
      touchProfile(p.address);
      client.send("inv", { inv: p.inv });
      client.send("bank", { open: true, entries: p.bank });
    });

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  onJoin(client: Client, options: { name?: string }) {
    const address = (client.auth as { address?: string })?.address ?? `guest:${client.sessionId}`;
    const account = address.startsWith("guest:") ? null : accountByAddress(address);
    const name =
      account?.name ?? sanitizeName(options?.name) ?? `Wanderer-${client.sessionId.slice(0, 4)}`;
    const profile = loadProfile(address, name);
    profile.name = name;
    this.sessions.set(client.sessionId, { profile, gatherNode: null, nextGatherAt: 0, bankOpen: false });

    const p = new PlayerState();
    p.name = name;
    p.look = encodeLook(account?.appearance ?? randomLook(address));
    p.x = profile.pos?.x ?? SPAWN.x + (Math.random() - 0.5) * 8;
    p.z = profile.pos?.z ?? SPAWN.z + (Math.random() - 0.5) * 8;
    if (!isWalkable(p.x, p.z)) {
      p.x = SPAWN.x;
      p.z = SPAWN.z;
    }
    p.tx = p.x;
    p.tz = p.z;
    this.state.players.set(client.sessionId, p);

    client.send("profile", { address, skills: profile.skills, inv: profile.inv, bankPos: BANK_POS });
    this.broadcast(EVT.system, { text: `${p.name} has arrived.` }, { except: client });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    const s = this.sessions.get(client.sessionId);
    if (p && s) {
      s.profile.pos = { x: p.x, z: p.z };
      touchProfile(s.profile.address);
      this.broadcast(EVT.system, { text: `${p.name} has left.` });
    }
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
  }

  // ---- gathering -----------------------------------------------------------

  private handleInteract(client: Client, nodeId: string) {
    const p = this.state.players.get(client.sessionId);
    const s = this.sessions.get(client.sessionId);
    const node = this.nodes.get(nodeId);
    if (!p || !s || !node) return;
    const sp = NODE_SPECIES[node.species];
    if (!sp) return;
    if (this.state.depleted.has(nodeId)) return;

    const level = levelForXp(s.profile.skills[sp.skill]);
    if (level < sp.level) {
      client.send("msg", { text: `You need ${sp.skill} level ${sp.level} for ${sp.name}.` });
      return;
    }
    if (freeSlot(s.profile) < 0) {
      client.send("msg", { text: "Your pack is full." });
      return;
    }
    // walk to the node edge, then the tick loop starts gathering
    const dx = p.x - node.x;
    const dz = p.z - node.z;
    const d = Math.hypot(dx, dz) || 1;
    const standR = sp.radius + 0.3;
    p.tx = node.x + (dx / d) * standR;
    p.tz = node.z + (dz / d) * standR;
    p.moving = true;
    s.gatherNode = nodeId;
    s.nextGatherAt = 0;
  }

  private stopGathering(sessionId: string, p: PlayerState) {
    const s = this.sessions.get(sessionId);
    if (s) s.gatherNode = null;
    p.action = "idle";
  }

  private tick(dtMs: number) {
    const now = Date.now();
    // respawn nodes
    this.state.depleted.forEach((respawnAt, id) => {
      if (respawnAt <= now) this.state.depleted.delete(id);
    });

    this.state.players.forEach((p, sessionId) => {
      const swimming = moveStateAt(p.x, p.z) === "swim";
      const step = ((swimming ? RUN_SPEED * SWIM_SPEED_MULT : RUN_SPEED) * dtMs) / 1000;
      if (p.moving) {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= step) {
          p.x = p.tx;
          p.z = p.tz;
          p.moving = false;
        } else {
          const nx = p.x + (dx / dist) * step;
          const nz = p.z + (dz / dist) * step;
          if (isWalkable(nx, nz)) {
            p.x = nx;
            p.z = nz;
            p.heading = Math.atan2(dx, dz);
          } else {
            p.moving = false; // stopped at a shore/cliff
          }
        }
      }

      const s = this.sessions.get(sessionId);
      if (swimming) {
        if (p.action !== "swim") p.action = "swim";
      } else if (p.action === "swim") {
        p.action = "idle";
      }
      if (!s?.gatherNode) return;
      const node = this.nodes.get(s.gatherNode);
      const sp = node && NODE_SPECIES[node.species];
      if (!node || !sp || this.state.depleted.has(node.id)) {
        this.stopGathering(sessionId, p);
        return;
      }
      if (Math.hypot(p.x - node.x, p.z - node.z) > sp.radius + 0.8) return; // still walking
      p.moving = false;
      p.heading = Math.atan2(node.x - p.x, node.z - p.z);
      p.action = sp.kind === "rock" ? "mine" : "chop";

      if (s.nextGatherAt === 0) s.nextGatherAt = now + GATHER_TICK_MS;
      if (now < s.nextGatherAt) return;
      s.nextGatherAt = now + GATHER_TICK_MS;

      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (!client) return;
      const prof = s.profile;
      const level = levelForXp(prof.skills[sp.skill]);
      if (Math.random() > gatherChance(level, sp.level)) return;

      const slot = freeSlot(prof);
      if (slot < 0) {
        client.send("msg", { text: "Your pack is full." });
        this.stopGathering(sessionId, p);
        return;
      }
      prof.inv[slot] = sp.item;
      prof.skills[sp.skill] += sp.xp;
      touchProfile(prof.address);
      const newLevel = levelForXp(prof.skills[sp.skill]);
      client.send("inv", { inv: prof.inv });
      client.send("xp", { skill: sp.skill, xp: sp.xp, total: prof.skills[sp.skill], level: newLevel });
      if (newLevel > level) {
        this.broadcast(EVT.system, { text: `${p.name} reached ${sp.skill} level ${newLevel}!` });
      }
      if (Math.random() < sp.depleteChance) {
        this.state.depleted.set(node.id, now + sp.respawnMs);
        this.stopGathering(sessionId, p);
      }
    });
  }
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().slice(0, 20).replace(/[^\p{L}\p{N} _-]/gu, "");
  return n.length >= 2 ? n : null;
}
