import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import type { ChatLine, Net } from "./net";

function Hud({ net, status }: { net: Net | null; status: string }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!net) return;
    net.onChat((line) => setLines((prev) => [...prev.slice(-80), line]));
  }, [net]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines]);

  const submit = (e: Event) => {
    e.preventDefault();
    const text = draft.trim();
    if (text && net) {
      net.sendChat(text);
      setDraft("");
    }
  };

  return (
    <>
      <div class="status">{status}</div>
      <div class="chat">
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
      </div>
    </>
  );
}

export function mountHud(el: HTMLElement, net: Net | null, status: string) {
  render(<Hud net={net} status={status} />, el);
}
