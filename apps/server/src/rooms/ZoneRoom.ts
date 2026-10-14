import { Room, type Client } from "@colyseus/core";
import { MapSchema, Schema, type } from "@colyseus/schema";
import {
  GATHER_TICK_MS,
  ITEMS,
  MONSTERS,
  NODE_SPECIES,
  PLAYER_ATTACK_MS,
  SPAWN,
  STYLE_RANGE,
  SWIM_SPEED_MULT,
  allMonsterSpawns,
  allNodes,
  encodeLook,
  gatherChance,
  hitChance,
  isWalkable,
  levelForXp,
  maxHpForDefence,
  moveStateAt,
  playerDamage,
  randomLook,
  rollDamage,
  styleSkill,
  type CombatStyle,
  type MonsterSpawn,
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
  /** idle | chop | mine | swim | melee | shoot | cast */
  @type("string") action = "idle";
  /** race:sex:hair:hairColor:beard */
  @type("string") look = "";
  @type("int16") hp = 30;
  @type("int16") maxHp = 30;
}

export class MonsterState extends Schema {
  @type("string") species = "";
  @type("float32") x = 0;
  @type("float32") z = 0;
  @type("float32") heading = 0;
  @type("boolean") moving = false;
  @type("int16") hp = 1;
  @type("int16") maxHp = 1;
  @type("boolean") dead = false;
}

export class ZoneState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  /** nodeId -> ms timestamp when it respawns */
  @type({ map: "number" }) depleted = new MapSchema<number>();
  @type({ map: MonsterState }) monsters = new MapSchema<MonsterState>();
}

interface Session {
  profile: Profile;
  gatherNode: string | null;
  nextGatherAt: number;
  bankOpen: boolean;
  targetMonster: string | null;
  style: CombatStyle;
  nextAttackAt: number;
}

interface MonsterRuntime {
  spawn: MonsterSpawn;
  respawnAt: number;
  targetSid: string | null;
  nextAttackAt: number;
  nextScanAt: number;
}

const BANK_POS = { x: SPAWN.x + 10, z: SPAWN.z - 6, radius: 5 };
const MONSTER_MELEE = 1.7;
const LEASH = 32;

/** The seamless overworld. Caves/dungeons get their own room types later. */
export class ZoneRoom extends Room<ZoneState> {
  maxClients = ZONE_SHARD_CAP;
  nodes: Map<string, WorldNode> = allNodes();
  sessions = new Map<string, Session>();
  mruntime = new Map<string, MonsterRuntime>();

  async onAuth(_client: Client, options: { token?: string }) {
    const address = auth.sessionAddress(options?.token);
    return { address };
  }

  onCreate() {
    this.setState(new ZoneState());
    this.setPatchRate(TICK_MS);

    const spawns = allMonsterSpawns();
    for (const [id, s] of spawns) {
      const sp = MONSTERS[s.species]!;
      const m = new MonsterState();
      m.species = s.species;
      m.x = s.x;
      m.z = s.z;
      m.hp = sp.maxHp;
      m.maxHp = sp.maxHp;
      this.state.monsters.set(id, m);
      this.mruntime.set(id, { spawn: s, respawnAt: 0, targetSid: null, nextAttackAt: 0, nextScanAt: 0 });
    }
    console.log(`[world] overworld up — ${this.nodes.size} nodes, ${spawns.size} monsters`);

    this.onMessage(MSG.move, (client, msg: MoveMsg) => {
      const p = this.state.players.get(client.sessionId);
      const s = this.sessions.get(client.sessionId);
      if (!p || !s || typeof msg?.x !== "number" || typeof msg?.z !== "number") return;
      if (!isWalkable(msg.x, msg.z)) return;
      this.stopGathering(client.sessionId, p);
      s.targetMonster = null;
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

    this.onMessage("attack", (client, msg: { monsterId?: string; style?: string }) => {
      const p = this.state.players.get(client.sessionId);
      const s = this.sessions.get(client.sessionId);
      const id = String(msg?.monsterId ?? "");
      const m = this.state.monsters.get(id);
      const style = (["melee", "archery", "magic"].includes(String(msg?.style)) ? msg?.style : "melee") as CombatStyle;
      if (!p || !s || !m || m.dead) return;
      if (Math.hypot(p.x - m.x, p.z - m.z) > 48) return;
      this.stopGathering(client.sessionId, p);
      s.targetMonster = id;
      s.style = style;
      s.nextAttackAt = 0;
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
    this.sessions.set(client.sessionId, {
      profile,
      gatherNode: null,
      nextGatherAt: 0,
      bankOpen: false,
      targetMonster: null,
      style: "melee",
      nextAttackAt: 0,
    });

    const p = new PlayerState();
    p.name = name;
    p.look = encodeLook(account?.appearance ?? randomLook(address));
    p.maxHp = maxHpForDefence(levelForXp(profile.skills.defence));
    p.hp = p.maxHp;
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
    for (const rt of this.mruntime.values()) {
      if (rt.targetSid === client.sessionId) rt.targetSid = null;
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
    const dx = p.x - node.x;
    const dz = p.z - node.z;
    const d = Math.hypot(dx, dz) || 1;
    const standR = sp.radius + 0.3;
    p.tx = node.x + (dx / d) * standR;
    p.tz = node.z + (dz / d) * standR;
    p.moving = true;
    s.targetMonster = null;
    s.gatherNode = nodeId;
    s.nextGatherAt = 0;
  }

  private stopGathering(sessionId: string, p: PlayerState) {
    const s = this.sessions.get(sessionId);
    if (s) s.gatherNode = null;
    if (p.action !== "swim") p.action = "idle";
  }

  // ---- tick ----------------------------------------------------------------

  private tick(dtMs: number) {
    const now = Date.now();
    this.state.depleted.forEach((respawnAt, id) => {
      if (respawnAt <= now) this.state.depleted.delete(id);
    });

    this.state.players.forEach((p, sessionId) => {
      const s = this.sessions.get(sessionId);
      if (!s) return;
      const swimming = moveStateAt(p.x, p.z) === "swim";
      const step = ((swimming ? RUN_SPEED * SWIM_SPEED_MULT : RUN_SPEED) * dtMs) / 1000;

      // combat steering: keep walking toward the (moving) target
      if (s.targetMonster) {
        const m = this.state.monsters.get(s.targetMonster);
        if (!m || m.dead) {
          s.targetMonster = null;
          if (p.action.startsWith("melee") || p.action === "shoot" || p.action === "cast") p.action = "idle";
        } else {
          const range = STYLE_RANGE[s.style];
          const dist = Math.hypot(p.x - m.x, p.z - m.z);
          if (dist > range) {
            p.tx = m.x;
            p.tz = m.z;
            p.moving = true;
          } else {
            p.moving = false;
            p.heading = Math.atan2(m.x - p.x, m.z - p.z);
            this.playerAttack(sessionId, p, s, m, now);
          }
        }
      }

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
            p.moving = false;
          }
        }
      }

      if (swimming) {
        if (p.action !== "swim") p.action = "swim";
      } else if (p.action === "swim") {
        p.action = "idle";
      }

      this.gatherTick(sessionId, p, s, now);
    });

    this.monsterTick(dtMs, now);
  }

  private gatherTick(sessionId: string, p: PlayerState, s: Session, now: number) {
    if (!s.gatherNode) return;
    const node = this.nodes.get(s.gatherNode);
    const sp = node && NODE_SPECIES[node.species];
    if (!node || !sp || this.state.depleted.has(node.id)) {
      this.stopGathering(sessionId, p);
      return;
    }
    if (Math.hypot(p.x - node.x, p.z - node.z) > sp.radius + 0.8) return;
    p.moving = false;
    p.heading = Math.atan2(node.x - p.x, node.z - p.z);
    p.action = sp.kind === "rock" ? "mine" : sp.kind === "fishing" ? "fish" : "chop";

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
  }

  // ---- combat --------------------------------------------------------------

  private grantXp(sessionId: string, skill: string, amount: number) {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    const client = this.clients.find((c) => c.sessionId === sessionId);
    if (!s || !p || !client) return;
    const prof = s.profile;
    const skills = prof.skills as Record<string, number>;
    const before = levelForXp(skills[skill] ?? 0);
    skills[skill] = (skills[skill] ?? 0) + amount;
    touchProfile(prof.address);
    const after = levelForXp(skills[skill]!);
    client.send("xp", { skill, xp: amount, total: skills[skill], level: after });
    if (after > before) {
      this.broadcast(EVT.system, { text: `${p.name} reached ${skill} level ${after}!` });
      if (skill === "defence") p.maxHp = maxHpForDefence(after);
    }
  }

  private playerAttack(sessionId: string, p: PlayerState, s: Session, m: MonsterState, now: number) {
    p.action = s.style === "melee" ? "melee" : s.style === "archery" ? "shoot" : "cast";
    if (s.nextAttackAt === 0) s.nextAttackAt = now + 300;
    if (now < s.nextAttackAt) return;
    s.nextAttackAt = now + PLAYER_ATTACK_MS;

    const sp = MONSTERS[m.species]!;
    const skill = styleSkill(s.style);
    const level = levelForXp(s.profile.skills[skill]);
    const monsterId = s.targetMonster!;
    const hit = Math.random() < hitChance(level + 8, sp.defence);
    const { min, max } = playerDamage(level);
    const dmg = hit ? rollDamage(min, max) : 0;
    this.broadcast("fx", { kind: "attack", style: s.style, sid: sessionId, monsterId, dmg });
    if (!hit) return;
    m.hp = Math.max(0, m.hp - dmg);
    this.grantXp(sessionId, skill, Math.max(2, dmg * 4));
    if (m.hp === 0) this.killMonster(monsterId, m, sessionId, sp);
  }

  private killMonster(monsterId: string, m: MonsterState, killerSid: string, sp: (typeof MONSTERS)[string]) {
    m.dead = true;
    m.moving = false;
    const rt = this.mruntime.get(monsterId);
    if (rt) {
      rt.respawnAt = Date.now() + sp.respawnMs;
      rt.targetSid = null;
    }
    const s = this.sessions.get(killerSid);
    const client = this.clients.find((c) => c.sessionId === killerSid);
    if (s) {
      s.targetMonster = null;
      const p = this.state.players.get(killerSid);
      if (p) p.action = "idle";
      this.grantXp(killerSid, styleSkill(s.style), sp.xp);
      this.grantXp(killerSid, "defence", Math.ceil(sp.xp * 0.3));
      for (const drop of sp.drops) {
        if (Math.random() < drop.chance) {
          const slot = freeSlot(s.profile);
          if (slot < 0) {
            client?.send("msg", { text: "Your pack is too full for the spoils." });
            break;
          }
          s.profile.inv[slot] = drop.item;
          client?.send("msg", { text: `The ${sp.name} dropped ${ITEMS[drop.item]?.name ?? drop.item}.` });
        }
      }
      touchProfile(s.profile.address);
      client?.send("inv", { inv: s.profile.inv });
    }
  }

  private monsterTick(dtMs: number, now: number) {
    this.state.monsters.forEach((m, id) => {
      const rt = this.mruntime.get(id);
      const sp = MONSTERS[m.species];
      if (!rt || !sp) return;

      if (m.dead) {
        if (rt.respawnAt && now >= rt.respawnAt) {
          m.dead = false;
          m.hp = sp.maxHp;
          m.x = rt.spawn.x;
          m.z = rt.spawn.z;
          rt.respawnAt = 0;
        }
        return;
      }

      if (!rt.targetSid && sp.aggroRadius > 0 && now >= rt.nextScanAt) {
        rt.nextScanAt = now + 700;
        this.state.players.forEach((p, sid) => {
          if (rt.targetSid) return;
          if (Math.hypot(p.x - m.x, p.z - m.z) <= sp.aggroRadius) rt.targetSid = sid;
        });
      }

      const leashDist = Math.hypot(m.x - rt.spawn.x, m.z - rt.spawn.z);
      const target = rt.targetSid ? this.state.players.get(rt.targetSid) : null;
      if (rt.targetSid && (!target || leashDist > LEASH)) {
        rt.targetSid = null;
        m.hp = sp.maxHp; // reset on leash/lost target
      }

      let moveTo: { x: number; z: number } | null = null;
      if (target) {
        const dist = Math.hypot(target.x - m.x, target.z - m.z);
        if (dist > MONSTER_MELEE) {
          moveTo = { x: target.x, z: target.z };
        } else {
          m.moving = false;
          m.heading = Math.atan2(target.x - m.x, target.z - m.z);
          if (now >= rt.nextAttackAt) {
            rt.nextAttackAt = now + sp.attackMs;
            this.monsterHit(id, m, sp, rt.targetSid!, target);
          }
        }
      } else if (leashDist > 1.5) {
        moveTo = { x: rt.spawn.x, z: rt.spawn.z };
      }

      if (moveTo) {
        const step = (sp.speed * dtMs) / 1000;
        const dx = moveTo.x - m.x;
        const dz = moveTo.z - m.z;
        const dist = Math.hypot(dx, dz) || 1;
        const nx = m.x + (dx / dist) * Math.min(step, dist);
        const nz = m.z + (dz / dist) * Math.min(step, dist);
        if (isWalkable(nx, nz)) {
          m.x = nx;
          m.z = nz;
          m.heading = Math.atan2(dx, dz);
          m.moving = true;
        } else {
          m.moving = false;
        }
      } else if (!target) {
        m.moving = false;
      }
    });
  }

  private monsterHit(monsterId: string, m: MonsterState, sp: (typeof MONSTERS)[string], sid: string, p: PlayerState) {
    const s = this.sessions.get(sid);
    if (!s) return;
    const defLevel = levelForXp(s.profile.skills.defence);
    const hit = Math.random() < hitChance(sp.attack, defLevel + 6);
    const dmg = hit ? rollDamage(sp.dmin, sp.dmax) : 0;
    this.broadcast("fx", { kind: "monsterAttack", monsterId, sid, dmg });
    if (!hit || dmg === 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    this.grantXp(sid, "defence", Math.max(1, dmg * 2));
    if (p.hp === 0) this.playerDeath(sid, p, sp.name);
  }

  private playerDeath(sid: string, p: PlayerState, killer: string) {
    const client = this.clients.find((c) => c.sessionId === sid);
    this.broadcast(EVT.system, { text: `${p.name} was slain by a ${killer}.` });
    client?.send("msg", { text: "You black out… and wake at the Hearthmere hearth." });
    p.x = SPAWN.x + (Math.random() - 0.5) * 4;
    p.z = SPAWN.z + (Math.random() - 0.5) * 4;
    p.tx = p.x;
    p.tz = p.z;
    p.moving = false;
    p.hp = p.maxHp;
    const s = this.sessions.get(sid);
    if (s) {
      s.targetMonster = null;
      s.gatherNode = null;
    }
    for (const rt of this.mruntime.values()) {
      if (rt.targetSid === sid) rt.targetSid = null;
    }
  }
}

function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().slice(0, 20).replace(/[^\p{L}\p{N} _-]/gu, "");
  return n.length >= 2 ? n : null;
}
