import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { ITEMS, SKILLS, levelForXp, xpForLevel } from "@world/content";
import { apiLogin, apiRegister, type AuthResult, type ChatLine, type Net, type XpDrop } from "./net";

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

function Hud({ net, status }: { net: Net; status: string }) {
  const [, bump] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
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
      <div class="status">{status}</div>

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

      {panel === "skills" && g.skills && (
        <div class="panelbox skills">
          <h3>Skills</h3>
          {SKILLS.map((s) => {
            const xp = g.skills![s];
            const lvl = levelForXp(xp);
            const cur = xpForLevel(lvl);
            const next = xpForLevel(lvl + 1);
            const pct = next > cur ? Math.min(100, ((xp - cur) / (next - cur)) * 100) : 100;
            return (
              <div key={s} class="skill">
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

export function mountHud(el: HTMLElement, net: Net, status: string) {
  render(<Hud net={net} status={status} />, el);
}

export function mountStatus(el: HTMLElement, text: string) {
  render(<div class="status">{text}</div>, el);
}
