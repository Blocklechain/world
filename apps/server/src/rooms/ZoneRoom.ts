import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  CHAT_MAX_LEN,
  EVT,
  MSG,
  RUN_SPEED,
  TICK_MS,
  ZONES,
  ZONE_SHARD_CAP,
  type ChatMsg,
  type MoveMsg,
  type ZoneId,
} from "@world/shared";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") heading = 0;
  /** current server-side move target; mirrored so clients can animate */
  @type("float32") tx = 0;
  @type("float32") tz = 0;
  @type("boolean") moving = false;
}

export class ZoneState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

/**
 * One zone instance. Server-authoritative tap-to-move: the client sends a
 * target, the server walks the player there at RUN_SPEED on each tick.
 * Navmesh path validation replaces the flat-plane clamp once zones are baked.
 */
export class ZoneRoom extends Room<ZoneState> {
  maxClients = ZONE_SHARD_CAP;
  zoneId: ZoneId = "hearthmere";
  half = 48;

  onCreate(options: { zone?: ZoneId }) {
    this.zoneId = options.zone && options.zone in ZONES ? options.zone : "hearthmere";
    this.half = ZONES[this.zoneId].size / 2;
    this.setState(new ZoneState());
    this.setPatchRate(TICK_MS);

    this.onMessage(MSG.move, (client, msg: MoveMsg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof msg?.x !== "number" || typeof msg?.z !== "number") return;
      p.tx = clamp(msg.x, -this.half, this.half);
      p.tz = clamp(msg.z, -this.half, this.half);
      p.moving = true;
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

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  onJoin(client: Client, options: { name?: string }) {
    const p = new PlayerState();
    p.name = sanitizeName(options?.name) ?? `Wanderer-${client.sessionId.slice(0, 4)}`;
    // spawn scatter near the hearth so players don't stack
    p.x = (Math.random() - 0.5) * 6;
    p.z = (Math.random() - 0.5) * 6;
    p.tx = p.x;
    p.tz = p.z;
    this.state.players.set(client.sessionId, p);
    this.broadcast(EVT.system, { text: `${p.name} has arrived.` }, { except: client });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) this.broadcast(EVT.system, { text: `${p.name} has left.` });
    this.state.players.delete(client.sessionId);
  }

  private tick(dtMs: number) {
    const step = (RUN_SPEED * dtMs) / 1000;
    this.state.players.forEach((p) => {
      if (!p.moving) return;
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= step) {
        p.x = p.tx;
        p.z = p.tz;
        p.moving = false;
        return;
      }
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      p.heading = Math.atan2(dx, dz);
    });
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().slice(0, 20).replace(/[^\p{L}\p{N} _-]/gu, "");
  return n.length >= 2 ? n : null;
}
