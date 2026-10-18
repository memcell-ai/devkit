// Unified terminal renderer used by all CLI commands.
// Colour is enabled only for interactive TTYs when NO_COLOR is not set.

const enabled =
  process.stdout.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const paint = (code: string) => (text: string) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text);

// ── Semantic color roles ─────────────────────────────────────────────────
const ROLE = {
  /** Brand amber (#de8a33) for the MemCell mark and badge. */
  ember: paint("38;5;173"),
  emberBold: paint("1;38;5;173"),
  /** Primary value or title: crisp bold white. */
  value: paint("1;38;5;255"),
  /** Secondary label or description: readable muted gray. */
  label: paint("38;5;245"),
  /** Category, type, or mode badge: clean slate-lavender (non-italic). */
  variant: paint("38;5;146"),
  /** Runnable CLI command: bold sky-cyan. */
  cmd: paint("1;38;5;117"),
  /** Host URL, workspace namespace, or filesystem path: calm cyan-blue. */
  place: paint("38;5;110"),
  /** High-priority emphasis: bold magenta. */
  accent: paint("1;38;5;175"),
  /** Timestamps and durations: muted gold. */
  gold: paint("38;5;143"),
  good: paint("38;5;114"),
  warn: paint("38;5;179"),
  bad: paint("38;5;167"),
  faint: paint("38;5;242"),
  dim: paint("2"),
  blue: paint("38;5;75"),
  purple: paint("38;5;141"),
} as const;

export const MARK = "■";

export const GLYPH = {
  meter: "◆",
  live: "✦",
  note: "·",
  ok: "✓",
  bad: "✕",
  wait: "◇",
  pen: "✎",
} as const;

export type Tone = "good" | "warn" | "bad" | "accent" | "neutral";

export type Seg =
  | { k: "badge"; t: string }
  | { k: "place"; t: string }
  | { k: "value"; t: string }
  | { k: "label"; t: string }
  | { k: "variant"; t: string }
  | { k: "state"; tone: Tone; t: string; glyph?: string }
  | { k: "meter"; value: number; total: number; reading?: string }
  | { k: "chip"; tone: Tone }
  | { k: "time"; t: string }
  | { k: "id"; t: string }
  | { k: "cmd"; t: string }
  | { k: "list"; items: string[] }
  | { k: "text"; t: string }
  | { k: "scope"; scope: string };

export interface Row {
  depth: number;
  groups: Seg[][];
  meta?: Record<string, unknown>;
}

export const badge = (t: string): Seg => ({ k: "badge", t });
export const place = (t: string): Seg => ({ k: "place", t });
export const value = (t: string): Seg => ({ k: "value", t });
export const label = (t: string): Seg => ({ k: "label", t });
export const variant = (t: string): Seg => ({ k: "variant", t });
export const time = (t: string): Seg => ({ k: "time", t });
export const id = (t: string): Seg => ({ k: "id", t });

export const viaNpx = (): boolean =>
  (process.env.npm_execpath ?? "").endsWith("npx-cli.js") ||
  (process.argv[1] ?? "").includes("_npx");

export const cmd = (t: string): Seg => ({
  k: "cmd",
  t: viaNpx() && t.startsWith("memcell") ? `npx memcell@latest${t.slice("memcell".length)}` : t,
});
export const text = (t: string): Seg => ({ k: "text", t });
export const chip = (tone: Tone): Seg => ({ k: "chip", tone });
export const list = (items: string[]): Seg => ({ k: "list", items });
export const scopeBadge = (scope: string = "workspace"): Seg => ({ k: "scope", scope });

export const state = (tone: Tone, t: string, glyph?: string): Seg => ({
  k: "state",
  tone,
  t,
  glyph,
});
export const good = (t: string): Seg => state("good", t, GLYPH.ok);
export const warn = (t: string): Seg => state("warn", t);
export const bad = (t: string): Seg => state("bad", t, GLYPH.bad);
export const accent = (t: string): Seg => state("accent", t, GLYPH.live);

export const meter = (v: number, total: number, reading?: string): Seg => ({
  k: "meter",
  value: v,
  total,
  reading,
});

export function row(depth: number, ...groups: (Seg | Seg[] | null | undefined | false)[]): Row {
  const kept: Seg[][] = [];
  for (const group of groups) {
    if (!group) continue;
    const segs = (Array.isArray(group) ? group : [group]).filter(Boolean) as Seg[];
    if (segs.length === 0) continue;
    if (segs[0]!.k === "badge" && segs.length > 1) {
      kept.push([segs[0]!], segs.slice(1));
    } else {
      kept.push(segs);
    }
  }
  return { depth, groups: kept };
}

/** An empty spacer row between sections. */
export const blank = (): Row => ({ depth: 0, groups: [[{ k: "text", t: "" }]] });

const TONE_PAINT: Record<Tone, (t: string) => string> = {
  good: ROLE.good,
  warn: ROLE.warn,
  bad: ROLE.bad,
  accent: ROLE.accent,
  neutral: ROLE.dim,
};

const TONE_GLYPH: Record<Tone, string> = {
  good: GLYPH.ok,
  warn: "!",
  bad: GLYPH.bad,
  accent: GLYPH.live,
  neutral: "",
};

function blocks(valueNow: number, total: number, width = 14): string {
  if (total <= 0) return ROLE.dim("▱".repeat(width));
  const ratio = Math.min(Math.max(valueNow / total, 0), 1);
  const whole = Math.min(width, Math.floor(ratio * width));
  const partial = whole < width && ratio * width - whole > 1e-9 ? 1 : 0;
  return (
    ROLE.ember("▰".repeat(whole)) +
    (partial ? ROLE.dim("▰") : "") +
    ROLE.dim("▱".repeat(Math.max(0, width - whole - partial)))
  );
}

function segText(seg: Seg): string {
  switch (seg.k) {
    case "badge":
      return `${ROLE.ember(MARK)} ${ROLE.emberBold(seg.t)}`;
    case "place":
      return ROLE.place(seg.t);
    case "value":
      return ROLE.value(seg.t);
    case "label":
      return ROLE.label(seg.t);
    case "variant":
      return ROLE.variant(seg.t);
    case "state": {
      const glyph = seg.glyph ?? TONE_GLYPH[seg.tone];
      return TONE_PAINT[seg.tone](glyph ? `${glyph} ${seg.t}` : seg.t);
    }
    case "meter": {
      const bar = blocks(seg.value, seg.total);
      return seg.reading ? `${bar} ${ROLE.value(seg.reading)}` : bar;
    }
    case "chip":
      return TONE_PAINT[seg.tone]("▪");
    case "time":
      return ROLE.gold(seg.t);
    case "id":
      return ROLE.faint(seg.t);
    case "cmd":
      return ROLE.cmd(seg.t);
    case "list":
      return seg.items.map((i) => ROLE.value(i)).join(ROLE.dim(", "));
    case "text":
      return seg.t;
    case "scope": {
      const s = seg.scope.toLowerCase();
      if (s === "org" || s === "organization") {
        return ROLE.blue("[org]");
      }
      if (s === "team") {
        return ROLE.purple("[team]");
      }
      if (s === "user" || s === "my" || s === "my-memory") {
        return ROLE.good("[my]");
      }
      return ROLE.ember("[workspace]");
    }
  }
}

const DOT = ROLE.dim(" · ");

export function render(rows: (Row | null | undefined | false)[]): string {
  const out: string[] = [];
  for (const r of rows) {
    if (!r || r.groups.length === 0) continue;
    const indent = "  ".repeat(r.depth);
    out.push(indent + r.groups.map((g) => g.map(segText).join(" ")).join(DOT));
  }
  return out.join("\n");
}

export function say(...rows: (Row | null | undefined | false)[]): void {
  const body = render(rows);
  if (body.length === 0) return;
  console.log(`\n${body}\n`);
}

export function emit(payload: string): void {
  process.stdout.write(payload);
}

export function aside(...rows: (Row | null | undefined | false)[]): void {
  const body = render(rows);
  if (body.length === 0) return;
  process.stderr.write(`\n${body}\n\n`);
}

export const bar = blocks;

export function pending(width = 14, tick = 0): string {
  const at = tick % width;
  return ROLE.dim("▱".repeat(at)) + ROLE.ember("▰") + ROLE.dim("▱".repeat(width - at - 1));
}

export function repaint(rowNow: Row): void {
  if (!enabled) return;
  process.stdout.write(`\r\x1b[2K${render([rowNow])}`);
}

export function clearLine(): void {
  if (enabled) process.stdout.write("\r\x1b[2K");
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export const percent = (ratio: number): string =>
  ROLE.value(`${String(Math.round(ratio * 100)).padStart(2, " ")}%`);

export const separator = (): string => ROLE.dim("─".repeat(46));
