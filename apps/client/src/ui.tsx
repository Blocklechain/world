import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  BEARDS,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_STYLES,
  ITEMS,
  RACES,
  SEXES,
  SKILLS,
  levelForXp,
  skillBook,
  xpForLevel,
  type Appearance,
} from "@world/content";
import {
  apiAppearance,
  apiLogin,
  apiRegister,
  type AuthResult,
  type ChatLine,
  type Net,
  type XpDrop,
} from "./net";

// ---- character creation ----------------------------------------------------

const RACE_BLURB: Record<string, string> = {
  human: "Versatile folk of the heartlands.",
  elf: "Tall and keen-eyed, old as the woods.",
  dwarf: "Stout delvers of the Worldspine.",
};

function Chips<T extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <div class="chips">
      <span class="lbl">{label}</span>
      <div class="row">
        {options.map((o) => (
          <button key={o} class={o === value ? "on" : ""} onClick={() => onPick(o)}>
            {o === "m" ? "male" : o === "f" ? "female" : o}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateCharacter({ auth, onDone }: { auth: AuthResult; onDone: () => void }) {
  const [a, setA] = useState<Appearance>({ ...DEFAULT_APPEARANCE });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setA((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await apiAppearance(auth.token, a);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="auth">
      <div class="panel create">
        <h1>Your Hero</h1>
        <p class="sub">{RACE_BLURB[a.race]}</p>
        <Chips label="Race" options={RACES} value={a.race} onPick={(v) => set("race", v)} />
        <Chips label="Body" options={SEXES} value={a.sex} onPick={(v) => set("sex", v)} />
        <Chips label="Hair" options={HAIR_STYLES} value={a.hair} onPick={(v) => set("hair", v)} />
        <Chips
          label="Hair color"
          options={HAIR_COLORS}
          value={a.hairColor}
          onPick={(v) => set("hairColor", v)}
          disabled={a.hair === "bald" && a.beard === "none"}
        />
        <Chips
          label="Beard"
          options={BEARDS}
          value={a.beard}
          onPick={(v) => set("beard", v)}
          disabled={a.sex === "f"}
        />
        {error && <div class="err">{error}</div>}
        <button class="go" disabled={busy} onClick={submit}>
          {busy ? "…" : `Enter Veyra as ${auth.name}`}
        </button>
      </div>
    </div>
  );
}

export function mountCreate(el: HTMLElement, auth: AuthResult, onDone: () => void) {
  render(<CreateCharacter auth={auth} onDone={onDone} />, el);
}

// ---- auth overlay ----------------------------------------------------------

function AuthOverlay({ onDone }: { onDone: (auth: AuthResult | null) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const auth =
        mode === "login" ? await apiLogin(email, password) : await apiRegister(email, password, name);
      localStorage.setItem("world:auth", JSON.stringify(auth));
      onDone(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="auth">
      <div class="panel">
        <h1>WORLD</h1>
        <p class="sub">The fallen kingdom of Veyra awaits.</p>
        <div class="tabs">
          <button class={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
            Sign in
          </button>
          <button class={mode === "register" ? "on" : ""} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <input
              placeholder="Character name"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              maxLength={20}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
          {error && <div class="err">{error}</div>}
          <button class="go" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Enter the world" : "Begin your story"}
          </button>
        </form>
        <button class="guest" onClick={() => onDone(null)}>
          Wander in as a guest
        </button>
      </div>
    </div>
  );
}

// ---- HUD -------------------------------------------------------------------

type Panel = "none" | "inv" | "skills";

export interface CombatRef {
  style: "melee" | "archery" | "magic";
}

const STYLE_ICONS = { melee: "⚔️", archery: "🏹", magic: "✨" } as const;

function Hud({ net, status, combat }: { net: Net; status: string; combat: CombatRef }) {
  const [style, setStyle] = useState(combat.style);
  const [hp, setHp] = useState<{ hp: number; max: number } | null>(null);

  useEffect(() => {
    const iv = setInterval(() => {
      const self = (net.room.state as { players?: Map<string, { hp: number; maxHp: number }> }).players?.get(
        net.sessionId,
      );
      if (self) setHp((prev) => (prev?.hp === self.hp && prev?.max === self.maxHp ? prev : { hp: self.hp, max: self.maxHp }));
    }, 300);
    return () => clearInterval(iv);
  }, [net]);

  return (
    <HudInner
      net={net}
      status={status}
      hp={hp}
      style={style}
      setStyle={(s) => {
        combat.style = s;
        setStyle(s);
      }}
    />
  );
}

function HudInner({
  net,
  status,
  hp,
  style,
  setStyle,
}: {
  net: Net;
  status: string;
  hp: { hp: number; max: number } | null;
  style: CombatRef["style"];
  setStyle: (s: CombatRef["style"]) => void;
}) {
  const [, bump] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [book, setBook] = useState<(typeof SKILLS)[number] | null>(null);
  const [drops, setDrops] = useState<XpDrop[]>([]);
  const [toast, setToast] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    net.onChat((line) => setLines((prev) => [...prev.slice(-60), line]));
    net.onGameChange(() => bump((n) => n + 1));
    net.onXp((d) => {
      setDrops((prev) => [...prev.slice(-4), d]);
      setTimeout(() => setDrops((prev) => prev.filter((x) => x !== d)), 2500);
    });
    net.onMsg((text) => {
      setToast(text);
      setTimeout(() => setToast(""), 2600);
    });
  }, [net]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines]);

  const submit = (e: Event) => {
    e.preventDefault();
    const text = draft.trim();
    if (text) {
      net.sendChat(text);
      setDraft("");
    }
  };

  const g = net.game;

  return (
    <>
      <div class="status">
        {status}
        {hp && (
          <div class="hpbar">
            <div class="fill" style={{ width: `${(hp.hp / hp.max) * 100}%` }} />
            <span>
              {hp.hp}/{hp.max}
            </span>
          </div>
        )}
      </div>

      <div class="styles">
        {(Object.keys(STYLE_ICONS) as CombatRef["style"][]).map((s) => (
          <button key={s} class={s === style ? "on" : ""} title={s} onClick={() => setStyle(s)}>
            {STYLE_ICONS[s]}
          </button>
        ))}
      </div>

      <div class="drops">
        {drops.map((d, i) => (
          <div key={d.ts + i} class="drop">
            +{d.xp} {d.skill}
          </div>
        ))}
      </div>
      {toast && <div class="toast">{toast}</div>}

      <div class="side">
        <button class={panel === "inv" ? "on" : ""} onClick={() => setPanel(panel === "inv" ? "none" : "inv")}>
          🎒
        </button>
        <button
          class={panel === "skills" ? "on" : ""}
          onClick={() => setPanel(panel === "skills" ? "none" : "skills")}
        >
          ⭐
        </button>
        <button class={chatOpen ? "on" : ""} onClick={() => setChatOpen(!chatOpen)}>
          💬
        </button>
      </div>

      {panel === "inv" && (
        <div class="panelbox inv">
          <h3>Pack</h3>
          <div class="grid">
            {g.inv.map((id, slot) => (
              <div
                key={slot}
                class={`cell ${id ? "full" : ""}`}
                style={id ? { background: ITEMS[id]?.tint } : {}}
                title={id ? ITEMS[id]?.name : ""}
                onClick={() => {
                  if (!id) return;
                  if (g.bankOpen) net.bankDeposit(slot, true);
                }}
              >
                {id ? abbrev(ITEMS[id]?.name ?? id) : ""}
              </div>
            ))}
          </div>
          {g.bankOpen && <p class="hint">Tap an item to bank all of that kind.</p>}
        </div>
      )}

      {panel === "skills" && g.skills && !book && (
        <div class="panelbox skills">
          <h3>Skills</h3>
          <p class="hint">Tap a skill to open its book.</p>
          {SKILLS.map((s) => {
            const xp = g.skills![s];
            const lvl = levelForXp(xp);
            const cur = xpForLevel(lvl);
            const next = xpForLevel(lvl + 1);
            const pct = next > cur ? Math.min(100, ((xp - cur) / (next - cur)) * 100) : 100;
            return (
              <div key={s} class="skill" onClick={() => setBook(s)}>
                <span class="nm">{s}</span>
                <span class="lv">{lvl}</span>
                <div class="bar">
                  <div class="fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {panel === "skills" && g.skills && book && (
        <div class="panelbox skills book">
          <h3>
            <button class="back" onClick={() => setBook(null)}>
              ←
            </button>
            {book} — level {levelForXp(g.skills[book])}
          </h3>
          <p class="hint">
            {xpForLevel(levelForXp(g.skills[book]) + 1) - g.skills[book]} xp to level{" "}
            {levelForXp(g.skills[book]) + 1}
          </p>
          {skillBook(book).map((u, i) => {
            const have = levelForXp(g.skills![book]) >= u.level;
            return (
              <div key={i} class={`unlock ${have ? "have" : ""}`}>
                <span class="ulv">{u.level}</span>
                <span>{u.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {g.bankOpen && (
        <div class="panelbox bank">
          <h3>Bank of Hearthmere</h3>
          {Object.keys(g.bank).length === 0 && <p class="hint">Your vault is empty.</p>}
          <div class="bankgrid">
            {Object.entries(g.bank).map(([id, qty]) => (
              <div key={id} class="bankrow">
                <span class="tintdot" style={{ background: ITEMS[id]?.tint }} />
                <span class="nm">{ITEMS[id]?.name ?? id}</span>
                <span class="qty">×{qty}</span>
                <button onClick={() => net.bankWithdraw(id, 1)}>1</button>
                <button onClick={() => net.bankWithdraw(id, 28)}>All</button>
              </div>
            ))}
          </div>
          <p class="hint">Open your pack to deposit. Walk away to close.</p>
        </div>
      )}

      <div class={`chat ${chatOpen ? "open" : ""}`}>
        <div class="log" ref={logRef}>
          {lines.map((l, i) =>
            l.system ? (
              <div key={i} class="sys">
                {l.text}
              </div>
            ) : (
              <div key={i}>
                <b>{l.from}:</b> {l.text}
              </div>
            ),
          )}
        </div>
        {chatOpen && (
          <form onSubmit={submit}>
            <input
              value={draft}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              placeholder="Say something…"
              maxLength={240}
              enterkeyhint="send"
            />
            <button type="submit">Send</button>
          </form>
        )}
      </div>
    </>
  );
}

function abbrev(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.map((p) => p[0]).join("").toUpperCase() : name.slice(0, 2);
}

export function mountAuth(el: HTMLElement, onDone: (auth: AuthResult | null) => void) {
  render(<AuthOverlay onDone={onDone} />, el);
}

export function mountHud(el: HTMLElement, net: Net, status: string, combat: CombatRef) {
  render(<Hud net={net} status={status} combat={combat} />, el);
}

export function mountStatus(el: HTMLElement, text: string) {
  render(<div class="status">{text}</div>, el);
}
