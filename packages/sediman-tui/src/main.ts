#!/usr/bin/env bun
/**
 * Sediman TUI — terminal-kit. Clean, responsive, no error swallowing.
 */
import * as tk from "terminal-kit"
import { ApiClient, runAgentTask } from "./bridge.js"

const term = (tk as any).terminal

const C = {
  r: "^r", g: "^g", b: "^b", c: "^c", y: "^y", k: "^k", w: "^w", rst: "^:", B: "^+",
}

type MT = "system" | "user" | "step" | "result" | "error"
type ST = "status" | "skills" | "sessions"
interface M { t: MT; s: string }
const SIDES: ST[] = ["status", "skills", "sessions"]

let msgs: M[] = [], inp = "", cur = 0, hist: string[] = [], hi = -1
let run = false, t0 = 0, cancel: (() => void) | null = null
let soff = 0, st: any = null, sk: any[] = [], ses: any[] = [], mem: any = null
let ok = false, side: ST = "status", frame = 0, pit: ReturnType<typeof setInterval> | null = null
const bridge = new ApiClient()
const now = () => Date.now()
const tr = (s: string, m: number) => s && s.length > m ? s.slice(0, Math.max(0, m - 1)) + "…" : s || ""

function add(t: MT, s: string) { msgs.push({ t, s }); soff = 0 }

// ── Commands ─────────────────────────────────────────────────────
const CMD: Array<{ n: string[]; d: string; c: string; fn: (a: string) => Promise<void> }> = []
function reg(n: string[], d: string, c: string, fn: (a: string) => Promise<void>) { CMD.push({ n, d, c, fn }) }

reg(["/help", "/h", "/?"], "Show commands", "general", async () => {
  const cats = new Map<string, string[]>()
  for (const c of CMD) {
    if (c.n[0].startsWith("/") && !c.n[0].includes(" ")) {
      const l = cats.get(c.c) || []; l.push(`  ${C.c}${c.n[0]}${C.rst} ${C.k}${c.d}${C.rst}`); cats.set(c.c, l)
    }
  }
  let o = `${C.B}${C.b}Commands${C.rst}\n`
  for (const [cat, items] of cats) o += `\n${C.B}${C.y}${cat}${C.rst}\n${items.join("\n")}\n`
  o += `\n${C.k}Tab:cycle │ ↑↓:history │ Esc:cancel │ ^C:exit${C.rst}`
  add("system", o)
})
reg(["/exit", "/quit", "/q"], "Exit", "general", async () => process.exit(0))
reg(["/clear", "/cls"], "Clear", "general", async () => { msgs = []; soff = 0 })
reg(["/status", "/st"], "Server status", "info", async () => {
  try { const s = await bridge.status(); st = s; add("system", `${C.B}Status${C.rst}\n  Provider:${s.provider||"?"} Model:${s.model||"?"}\n  Browser:${s.browser_open?"open":"closed"} Jobs:${s.scheduler?.active_jobs||0}`) }
  catch (e: any) { add("error", `Status: ${e.message}`) }
})
reg(["/model"], "/model <prov> [model]", "agent", async (a) => {
  const p = a.trim().split(/\s+/)
  if (!p[0]) { add("system", `${C.y}Usage: /model <provider> [model]${C.rst}`); return }
  try { await bridge.switchModel(p[0], p[1]); add("system", `${C.g}→${C.rst} ${p[0]}${p[1]?` / ${p[1]}`:""}`) } catch (e: any) { add("error", e.message) }
})
reg(["/models"], "List providers", "agent", async () => {
  try { const p = await bridge.listProviders(); add("system", `${C.B}Providers${C.rst}\n`+p.map((x:any)=>`  ${C.c}${x.name}${C.rst} → ${x.default_model||"?"}`).join("\n")) } catch (e: any) { add("error", e.message) }
})
reg(["/skills","/sk"], "List skills", "skills", async () => {
  try { const s = await bridge.listSkills(); add("system", s.length ? `${C.B}Skills (${s.length})${C.rst}\n`+s.map((x:any)=>`  ${C.c}${x.name}${C.rst} ${tr(x.description||"",50)}`).join("\n") : `${C.k}No skills${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/skill"], "/skill <name>", "skills", async (a) => {
  if (!a.trim()) { add("system", `${C.y}Usage: /skill <name>${C.rst}`); return }
  try { const s = await bridge.getSkill(a.trim()); add("system", s ? `${C.B}${s.name}${C.rst} v${s.version||1}  ${tr(s.description||"",60)}` : `${C.r}Not found${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/run"], "/run <name>", "skills", async (a) => {
  if (!a.trim()) { add("system", `${C.y}Usage: /run <name>${C.rst}`); return }
  try { add("result", await bridge.executeSkill(a.trim())) } catch (e: any) { add("error", e.message) }
})
reg(["/hub"], "Browse hub", "skills", async () => {
  try { const h = await bridge.hubBrowse(); add("system", `${C.B}Hub (${h.length})${C.rst}\n`+h.slice(0,20).map((x:any)=>`  ${C.c}${x.name}${C.rst} ${tr(x.description||"",50)}`).join("\n")+(h.length>20?`\n+${h.length-20} more`:"")) } catch (e: any) { add("error", e.message) }
})
reg(["/hub-install"], "/hub-install <name>", "skills", async (a) => {
  if (!a.trim()) { add("system", `${C.y}Usage: /hub-install <name>${C.rst}`); return }
  try { add("system", `${C.g}${await bridge.hubInstall(a.trim())||"Installed"}${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/memory","/mem"], "Memory usage", "info", async () => {
  try { const m = await bridge.getMemory(); mem = m; const mu = m.usage?.memory; add("system", `${C.B}Memory${C.rst}\n  ${mu?.chars||0}/${mu?.limit||2200} (${mu?.pct||0}%)`) } catch (e: any) { add("error", e.message) }
})
reg(["/remember","/rmb"], "/remember <text>", "info", async (a) => {
  if (!a.trim()) { add("system", `${C.y}Usage: /remember <text>${C.rst}`); return }
  try { await bridge.addMemory("memory", a.trim()); add("system", `${C.g}Remembered.${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/sessions","/ss"], "Recent sessions", "info", async () => {
  try { const s = await bridge.listSessions(); ses = s; add("system", s.length ? `${C.B}Sessions${C.rst}\n`+s.slice(0,10).map((x:any)=>`  ${tr((x.created_at||"").slice(0,16),16)} ${tr(x.task||"",50)}`).join("\n") : `${C.k}No sessions${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/schedule","/sched"], "Scheduled jobs", "info", async () => {
  try { const j = await bridge.listSchedules(); add("system", j.length ? `${C.B}Jobs${C.rst}\n`+j.map((x:any)=>`  ${C.c}${x.cron}${C.rst} ${tr(x.task||"",50)}${x.skill_name?` (${x.skill_name})`:""}`).join("\n") : `${C.k}No jobs${C.rst}`) } catch (e: any) { add("error", e.message) }
})
reg(["/doctor","/diag"], "Diagnostics", "info", async () => {
  try { const d = await bridge.doctor(); const ch = d.checks||{}; add("system", `${C.B}Diagnostics${C.rst}\n`+Object.entries(ch).map(([k,v])=>`  ${v?`${C.g}✓${C.rst}`:`${C.r}✗${C.rst}`} ${k}`).join("\n")) } catch (e: any) { add("error", e.message) }
})
reg(["/terminal","/term"], "/terminal [on|off]", "agent", async (a) => {
  const v = a.trim().toLowerCase()
  try {
    if (v==="on"||v==="off") { await bridge.setTerminal(v==="on"); add("system", `Terminal: ${v==="on"?`${C.g}on${C.rst}`:`${C.k}off${C.rst}`}`) }
    else { add("system", `Terminal: ${(await bridge.getTerminalStatus())?`${C.g}on${C.rst}`:`${C.k}off${C.rst}`}`) }
  } catch (e: any) { add("error", e.message) }
})

// ── Poll ─────────────────────────────────────────────────────────
async function poll() {
  try {
    const [s, ks, ss] = await Promise.all([bridge.status(), bridge.listSkills().catch(()=>[]), bridge.listSessions().catch(()=>[])])
    st = s; sk = ks; ses = ss; ok = true
  } catch { ok = false }
}

// ── Render ───────────────────────────────────────────────────────
const SP = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
const el = (ms: number) => { const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}` }

function render() {
  const w = term.width, h = term.height
  if (w < 60 || h < 10) { term.moveTo(1,1); term(`${C.r}Terminal too small: ${w}x${h}${C.rst}`); return }
  const sw = Math.min(26, Math.floor(w * 0.28)), mw = w - sw - 1, mh = h - 3
  const total = msgs.length, maxS = Math.max(total - mh, 0), s = Math.min(soff, maxS)
  frame++

  // ── Header bar ─────────────────────────────────────────────
  term.moveTo(1,1)
  term.bgBlack(`${C.w}${C.B}  ◆${C.rst}`)
  term.bgBlack(`${C.c}${C.B} Sediman ${C.rst}`)
  if (run) term.bgBlack(` ${SP[frame%SP.length]} ${el(now()-t0)} `)
  const ri = ` ${st?.provider||"?"}/${st?.model||"?"} `
  term.column(mw - ri.length - 1)
  term.bgBlack(`${C.k}${ri}${C.rst}`)
  term.column(mw - 1)
  term.bgBlack(`${ok?C.g:C.r}${ok?"●":"○"}${C.rst} `)
  for (let x = term.column; x <= w; x++) term.bgBlack(" ")
  term("")

  // ── Messages ───────────────────────────────────────────────
  let row = 2
  if (total === 0 && s === 0) {
    const banner = [
      `${C.c}${C.B}    ______                   __  __${C.rst}`,
      `${C.c}${C.B}   /      \\                 /  |/  |${C.rst}`,
      `${C.c}${C.B}  /$$$$$$  |  ______    ____$$ |$$/  _____  ____    ______   _______${C.rst}`,
      `${C.c}${C.B}  $$ \\__$$/  /      \\  /    $$ |/  |/     \\/    \\  /      \\ /       \\${C.rst}`,
      `${C.c}${C.B}  $$      \\ /$$$$$$  |/$$$$$$$ |$$ |$$$$$$ $$$$  | $$$$$$  |$$$$$$$  |${C.rst}`,
      `${C.c}${C.B}   $$$$$$  |$$    $$ |$$ |  $$ |$$ |$$ | $$ | $$ | /    $$ |$$ |  $$ |${C.rst}`,
      `${C.c}${C.B}  /  \\__$$ |$$$$$$$$/ $$ \\__$$ |$$ |$$ | $$ | $$ |/$$$$$$$ |$$ |  $$ |${C.rst}`,
      `${C.c}${C.B}  $$    $$/ $$       |$$    $$ |$$ |$$ | $$ | $$ |$$    $$ |$$ |  $$ |${C.rst}`,
      `${C.c}${C.B}   $$$$$$/   $$$$$$$/  $$$$$$$/ $$/ $$/  |$$/  $$/  $$$$$$$/ $$/   $$/${C.rst}`,
    ]
    for (const l of banner) { term.moveTo(Math.floor((w-50)/2), row++); term(l) }
    while (row <= h - 1) { term.moveTo(1, row++); term(" ".repeat(mw)) }
    term.moveTo(1, h-1); term(`${C.k}${"─".repeat(Math.min(mw,40))}${C.rst}`)
  } else {
    const from = Math.max(0, total - mh - s)
    for (let i = from; i < total - s && row <= h - 2; i++) {
      term.moveTo(1, row)
      const m = msgs[i]
      if (m.t === "user") term(`${C.B}${C.c}┃${C.rst} ${C.B}${C.w}${tr(m.s, mw-4)}${C.rst}`)
      else if (m.t === "step") {
        const ic = m.s.startsWith("planning")?"▸":m.s.startsWith("executing")?"▸":m.s.startsWith("observing")?"◎":"•"
        term(`${C.k} ${ic} ${tr(m.s, mw-4)}${C.rst}`)
      }
      else if (m.t === "result") term(`${C.B}${C.g}┃${C.rst} ${tr(m.s, mw-4)}`)
      else if (m.t === "error") term(`${C.B}${C.r}✗${C.rst} ${C.r}${tr(m.s, mw-4)}${C.rst}`)
      else term(tr(m.s, mw))
      for (let x = term.column; x <= mw; x++) term(" ")
      row++
    }
    while (row <= h - 2) { term.moveTo(1, row); term(" ".repeat(mw)); row++ }
    if (s > 0) { term.moveTo(mw - 8, 2); term(`${C.k}↑${Math.round(s/maxS*100)}% ${total}${C.rst}`) }
  }

  // ── Side panel ─────────────────────────────────────────────
  for (let y = 2; y <= h - 1; y++) { term.moveTo(mw + 1, y); term(`${C.k}│${C.rst}`) }
  const sx = mw + 2
  term.moveTo(sx, 2)
  for (const t of SIDES) {
    if (side === t) term.bgBlack(`${C.w} ${t} ${C.rst}`)
    else term(`${C.k} ${t} ${C.rst}`)
    term(" ")
  }
  term.bgBlack(" ".repeat(Math.max(0, sw - SIDES.reduce((a, t) => a + t.length + 3, 0))))
  let sr = 3
  if (side === "status") {
    const mu = (mem?.usage?.memory as any) || {}
    const items: Array<[string, string]> = [
      ["Browser", st?.browser_open ? `${C.g}open${C.rst}` : `${C.k}closed${C.rst}`],
      ["Model", st?.model || `${C.k}—${C.rst}`],
      ["Provider", st?.provider || `${C.k}—${C.rst}`],
      ["Memory", `${mu.pct>90?C.r:mu.pct>70?C.y:C.k}${mu.chars||0}/${mu.limit||2200}${C.rst}`],
      ["Skills", `${C.c}${sk.length}${C.rst}`],
      ["Jobs", `${st?.scheduler?.active_jobs||0} active`],
      ["Tasks", `${msgs.length}`],
    ]
    for (const [l, v] of items) {
      if (sr > h - 3) break
      term.moveTo(sx, sr)
      term(`${C.k}${l}${C.rst}`)
      term.column(sx + 9)
      term(v); term.eraseLineAfter(); sr++
    }
  } else {
    const data = side === "skills" ? sk : ses
    const label = side === "skills" ? "Skills" : "Sessions"
    term.moveTo(sx, sr); term(`${C.B}${C.c}${label}${C.rst}`); sr++
    if (data.length === 0 && sr <= h-2) { term.moveTo(sx, sr); term(`${C.k}No ${side} yet${C.rst}`); sr++ }
    for (const item of data.slice(0, h-sr-2)) {
      if (sr > h-2) break
      term.moveTo(sx, sr); const nm = (item as any).task || (item as any).name || "?"
      term(`${C.k}◆${C.rst} ${tr(nm, sw-3)}`); term.eraseLineAfter(); sr++
    }
  }
  for (let y = sr; y <= h - 1; y++) { term.moveTo(sx, y); term(" ".repeat(sw)) }

  // ── Input bar ─────────────────────────────────────────────
  term.moveTo(1, h)
  if (run) {
    term.bgBlack(`${C.y} ${SP[frame%SP.length]} Running ${el(now()-t0)} ${C.rst}`)
    term.column(w - 10)
    term.bgBlack(`${C.k} Esc:cancel${C.rst}`)
  } else if (!ok) {
    term.bgBlack(`${C.k} ● Sediman — backend offline${C.rst}`)
  } else {
    term.bgBlack(`${C.c}${C.B} ▸${C.rst}`)
    if (inp.length > 0) {
      term.bgBlack(`${C.w}${inp.slice(0,cur)}${C.rst}`)
      term.bgWhite(term.black(inp[cur]||" "))
      term.bgBlack(`${C.w}${inp.slice(cur+1)}${C.rst}`)
    } else {
      term.bgWhite(term.black(" "))
      term.bgBlack(`${C.k} Type a message...${C.rst}`)
    }
  }
  for (let x = term.column; x <= w; x++) term.bgBlack(" ")
}

// ── Input dispatch ──────────────────────────────────────────────
async function dispatch(text: string) {
  if (text.startsWith("/")) {
    const p = text.split(/\s+/); const c = p[0].toLowerCase()
    const tw = p.length >= 2 ? `${c} ${p[1]}`.toLowerCase() : ""
    const d = CMD.find(x => x.n.includes(tw)) || CMD.find(x => x.n.includes(c))
    if (d) { await d.fn(tw ? p.slice(2).join(" ") : p.slice(1).join(" ")) }
    else add("error", `Unknown: ${c}. Try ${C.c}/help${C.rst}`)
    return
  }
  if (!text.trim()) return
  add("user", text)
  run = true; t0 = now()
  const task = runAgentTask(
    text,
    (phase, action, url) => add("step", `${phase}: ${url ? `${action} (${url})` : action}`),
    (err) => { add("error", err); run = false },
    (result, sec, name) => {
      add("result", `${C.g}Done (${sec}s)${C.rst}${name ? ` ${C.c}◆ ${name}${C.rst}` : ""}`)
      if (result) add("result", result.slice(0,2000))
      run = false
    },
  )
  cancel = task.cancel
}

// ── Setup terminal ──────────────────────────────────────────────
const raw = (process.stdin as any).isTTY
if (!raw) { console.error("stdin is not a TTY"); process.exit(1) }

term.fullscreen(true)
term.grabInput({ mouse: false })

term.on("key", (key: string, _m: string[], data: any) => {
  try {
    if (key === "CTRL_C" || (key === "CTRL_D" && inp === "")) { term.fullscreen(false); process.exit(0) }
    if (key === "ESCAPE") {
      if (run) { run = false; cancel?.(); add("system", `${C.k}Cancelled.${C.rst}`) }
      return
    }
    if (key === "TAB") {
      if (inp) {
        const pre = inp.toLowerCase()
        const m = CMD.flatMap(d => d.n).filter(n => n.startsWith(pre) && n.startsWith("/"))
        if (m.length === 1) { inp = m[0] + " "; cur = inp.length }
        else if (m.length > 1) add("system", m.join(" "))
      } else { side = SIDES[(SIDES.indexOf(side) + 1) % SIDES.length] }
      return
    }
    if (key === "ENTER") {
      const t = inp.trim(); inp = ""; cur = 0
      if (t) { hist.push(t); hi = -1; dispatch(t) }
      return
    }
    if (key === "BACKSPACE") { if (cur > 0) { inp = inp.slice(0,cur-1)+inp.slice(cur); cur-- } return }
    if (key === "DELETE") { if (cur < inp.length) inp = inp.slice(0,cur)+inp.slice(cur+1); return }
    if (key === "UP") {
      hi = hi === -1 ? Math.max(0, hist.length-1) : Math.max(0, hi-1)
      if (hi >= 0 && hist[hi] !== undefined) { inp = hist[hi]; cur = inp.length }
      return
    }
    if (key === "DOWN") {
      hi++
      if (hi >= hist.length || hist[hi] === undefined) { hi = -1; inp = ""; cur = 0 }
      else { inp = hist[hi]; cur = inp.length }
      return
    }
    if (key === "LEFT") { cur = Math.max(0, cur-1); return }
    if (key === "RIGHT") { cur = Math.min(cur+1, inp.length); return }
    if (key === "HOME" || key === "CTRL_A") { cur = 0; return }
    if (key === "END" || key === "CTRL_E") { cur = inp.length; return }
    if (key === "CTRL_K") { inp = inp.slice(0, cur); return }
    if (key === "PAGE_UP") { soff = Math.min(soff+10, 99999); return }
    if (key === "PAGE_DOWN") { soff = Math.max(soff-10, 0); return }
    if (key.length === 1 && data?.isCharacter) {
      inp = inp.slice(0, cur) + key + inp.slice(cur)
      cur++
    }
  } catch (e: any) {
    term.moveTo(1, term.height - 1)
    term(`${C.r}ERR: ${e.message}${C.rst}`)
  }
})

// ── Init ───────────────────────────────────────────────────────
async function init() {
  await poll()
  if (ok) add("system", `${C.g}●${C.rst} ${st?.provider||"?"} / ${st?.model||"?"}`)
  pit = setInterval(poll, 15000)
}
process.on("SIGINT", () => { term.fullscreen(false); process.exit(0) })
process.on("SIGTERM", () => { term.fullscreen(false); process.exit(0) })

init()
setInterval(() => render(), 1000 / 24)
