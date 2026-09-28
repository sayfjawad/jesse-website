// Stroomprijs · daggrafiek & advies — Node.js server (zero dependencies).
// Fetches the same EPEX SPOT NL data as https://stroomprijs-api.cloudcraft.tech
// and serves it via its own endpoints, plus a NL/EN page that looks like the
// reference site. Binds to 0.0.0.0:3000 so nginx can expose it on jesse.sdai.nl.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const UPSTREAM = (process.env.STROOMPRIJS_UPSTREAM || "https://stroomprijs-api.cloudcraft.tech").replace(/\/+$/, "");
const HTTP_TIMEOUT = Number(process.env.STROOMPRIJS_TIMEOUT || 15000);

// ---- local Qwen chatbot config (config.env) ----
function loadConfig() {
  const cfgPath = path.join(ROOT, "config.env");
  if (!fs.existsSync(cfgPath)) return;
  const text = fs.readFileSync(cfgPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadConfig();

const QWEN_API_KEY = (process.env.QWEN_API_KEY || "").trim();
const QWEN_BASE_URL = (process.env.QWEN_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen2.5:7b";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ---- translations (NL/EN), mirroring the reference site ----
const STRINGS = {
  nl: {
    "brand.sub": "· daggrafiek & advies",
    "nav.now": "Vandaag", "nav.prices": "Prijzen",
    "nav.subscribe": "Dagrapport", "nav.api": "API",
    "ht.update": "bijgewerkt zojuist",
    "hb.pill": "GOEDKOOP · KOPEN",
    "hb.h": "Het is een<br/><em>uitstekend</em><br/>moment om te <em>kopen</em>.",
    "hb.p": "Vaatwasser, droger, EV opladen — zet ze nu aan.",
    "hb.cap": "PER KWH", "hb.note": "Goedkoopste venster vandaag:",
    "hb.ar": "verbruik plannen",
    "hs.pill": "DUUR · WACHT MET VERBRUIK",
    "hs.h": "Vanavond is het<br/>moment om <em>terug</em><br/>te leveren.",
    "hs.p": "Tijdens de avondpiek piekt de prijs. Heb je een thuisbatterij of zonneoverschot? Verkoop dan.",
    "hs.cap": "PIEKPRIJS", "hs.ar": "batterij ontladen",
    "lg.buy": "Kopen", "lg.hold": "Houden", "lg.sell": "Verkopen",
    "tg.today": "Vandaag", "tg.tomorrow": "Morgen", "tg.week": "7 dagen",
    "st.low": "Laagste", "st.avg": "Daggemiddelde", "st.high": "Hoogste",
    "st.spread": "Spreiding", "st.avgm": "over 24 uur", "st.spreadm": "hoog / laag",
    "bm.meta": "aangrenzende blokken van 3 uur",
    "bm.buy": "Om te kopen", "bm.sell": "Om te verkopen",
    "bm.t1": "prijs < gem", "bm.t2": "prijs > gem",
    "sb.badge": "Het Dagrapport · gratis",
    "sb.h": "Morgens grafiek,<br/><em>vandaag</em> al in<br/>je inbox.",
    "sb.p": "Elke middag om 15:01 sturen we je een rustige PDF met de prijzen van morgen, de goedkoopste en duurste uren, en wat we adviseren. Geen ruis, geen reclame.",
    "sb.placeholder": "jij@voorbeeld.nl", "sb.btn": "Stuur me het rapport",
    "sb.f1": "Gratis", "sb.f2": "Geen creditcard", "sb.f3": "Uitschrijven met 1 klik",
    "sb.success": "✓ Bedankt — check je inbox",
    "sb.error": "Ongeldig e-mailadres",
    "empty.tomorrow": "Beschikbaar vanaf 14:00",
    "api.title": "API · voor ontwikkelaars",
    "api.1": "prijzen · JSON", "api.2": "week · JSON", "api.3": "koopadvies",
    "api.4": "verkoopadvies", "api.5": "status", "api.6": "OpenAPI",
    "ft.r": "Node.js · data via EPEX SPOT NL · all-in tarief",
  },
  en: {
    "brand.sub": "· daily chart & advice",
    "nav.now": "Today", "nav.prices": "Prices",
    "nav.subscribe": "Daily Report", "nav.api": "API",
    "ht.update": "updated just now",
    "hb.pill": "CHEAP · BUY",
    "hb.h": "It's an<br/><em>excellent</em><br/>moment to <em>buy</em>.",
    "hb.p": "Dishwasher, dryer, EV charging — turn them on now.",
    "hb.cap": "PER KWH", "hb.note": "Cheapest window today:",
    "hb.ar": "schedule loads",
    "hs.pill": "EXPENSIVE · DELAY USAGE",
    "hs.h": "Tonight's the<br/>moment to <em>sell</em><br/>back to the grid.",
    "hs.p": "Around the evening peak, the price spikes. Have a home battery or solar overflow? Sell now.",
    "hs.cap": "PEAK PRICE", "hs.ar": "discharge battery",
    "lg.buy": "Buy", "lg.hold": "Hold", "lg.sell": "Sell",
    "tg.today": "Today", "tg.tomorrow": "Tomorrow", "tg.week": "7 days",
    "st.low": "Low", "st.avg": "Daily average", "st.high": "High",
    "st.spread": "Spread", "st.avgm": "over 24h", "st.spreadm": "high / low",
    "bm.meta": "adjacent 3-hour blocks",
    "bm.buy": "To buy", "bm.sell": "To sell",
    "bm.t1": "price < avg", "bm.t2": "price > avg",
    "sb.badge": "The Daily Report · free",
    "sb.h": "Tomorrow's chart,<br/>in your inbox<br/><em>today</em>.",
    "sb.p": "Every afternoon at 15:01 we send a calm PDF with tomorrow's prices, cheapest and most expensive hours, and our advice. No noise, no ads.",
    "sb.placeholder": "you@example.com", "sb.btn": "Send me the report",
    "sb.f1": "Free", "sb.f2": "No credit card", "sb.f3": "One-click unsubscribe",
    "sb.success": "✓ Thanks — check your inbox",
    "sb.error": "Invalid email address",
    "empty.tomorrow": "Available from 14:00",
    "api.title": "API · for developers",
    "api.1": "prices · JSON", "api.2": "week · JSON", "api.3": "buy advice",
    "api.4": "sell advice", "api.5": "status", "api.6": "OpenAPI",
    "ft.r": "Node.js · data via EPEX SPOT NL · all-in tariff",
  },
};

// ---- sample data used when the upstream is unreachable ----
const SAMPLE_TODAY = [
  [0, 0.22, "hold"], [1, 0.22, "hold"], [2, 0.19, "hold"], [3, 0.19, "hold"],
  [4, 0.19, "hold"], [5, 0.22, "hold"], [6, 0.23, "hold"], [7, 0.23, "hold"],
  [8, 0.19, "hold"], [9, 0.13, "buy"], [10, 0.07, "buy"], [11, 0.05, "buy"],
  [12, 0.02, "buy"], [13, 0.02, "buy"], [14, 0.07, "buy"], [15, 0.16, "hold"],
  [16, 0.23, "hold"], [17, 0.25, "sell"], [18, 0.29, "sell"], [19, 0.28, "sell"],
  [20, 0.25, "sell"], [21, 0.24, "sell"], [22, 0.23, "hold"],
].map(([hour, price, classification]) => ({ hour, price, classification }));

// ---- helpers ----
function stats(hours) {
  if (!hours || !hours.length) {
    return { low: 0, low_hour: 0, high: 0, high_hour: 0, avg: 0, spread: 0 };
  }
  let low = Infinity, high = -Infinity, lowHour = 0, highHour = 0, sum = 0;
  for (const h of hours) {
    sum += h.price;
    if (h.price < low) { low = h.price; lowHour = h.hour; }
    if (h.price > high) { high = h.price; highHour = h.hour; }
  }
  const avg = sum / hours.length;
  return {
    low, low_hour: lowHour, high, high_hour: highHour,
    avg, spread: low ? high / low : 0,
  };
}

function fmtEur(p, digits = 3) {
  return Number(p).toFixed(digits).replace(".", ",");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

async function fetchJson(pathname, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = UPSTREAM + pathname + qs;
  try {
    const resp = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(HTTP_TIMEOUT) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ---- response helpers ----
function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj));
}

// ---- HTML template (read once; tokens replaced per request) ----
const TEMPLATE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function renderIndex(data) {
  const hours = data.hours || [];
  const st = data.stats || stats(hours);
  const cur = data.current || {};
  const curHour = cur.hour != null ? cur.hour : null;
  const curPrice = cur.price != null ? cur.price : null;

  const clsMap = { buy: "lo", sell: "hi", hold: "" };
  const pdfChart = hours.map((h) => {
    const cls = clsMap[h.classification] || "";
    const height = ((h.price / (st.high > 0 ? st.high : 1)) * 100).toFixed(1);
    return `<i class="${cls}" style="height: ${height}%"></i>`;
  }).join("");

  const tokens = {
    "%%CUR_HOUR_RANGE%%": curHour != null ? `${pad2(curHour)}:00 – ${pad2((curHour + 1) % 24)}:00` : "--:--",
    "%%CUR_PRICE%%": curPrice != null ? fmtEur(curPrice) : "--",
    "%%STATS_LOW%%": fmtEur(st.low ?? 0),
    "%%STATS_HIGH%%": fmtEur(st.high ?? 0),
    "%%STATS_AVG%%": fmtEur(st.avg ?? 0),
    "%%STATS_SPREAD%%": Number(st.spread ?? 0).toFixed(1).replace(".", ","),
    "%%STATS_LOW_HOUR%%": pad2(st.low_hour ?? 0),
    "%%STATS_HIGH_HOUR%%": pad2(st.high_hour ?? 0),
    "%%STATS_LOW_HOUR_END%%": pad2(((st.low_hour ?? 0) + 3) % 24),
    "%%PDF_CHART%%": pdfChart,
    "%%STRINGS_JSON%%": JSON.stringify(STRINGS),
    "%%HOURS_JSON%%": JSON.stringify(hours),
  };

  let html = TEMPLATE;
  for (const [key, value] of Object.entries(tokens)) {
    html = html.split(key).join(value);
  }
  return html;
}

// ---- route handlers ----
async function handleIndex(res) {
  let prices = await fetchJson("/api/prices", { day: "today" });
  if (!prices) {
    prices = { day: "today", hours: SAMPLE_TODAY, stats: stats(SAMPLE_TODAY), current: null };
  }
  const hours = prices.hours || [];
  const current = prices.current || {};
  const st = prices.stats || stats(hours);
  send(res, 200, renderIndex({ hours, stats: st, current }), "text/html; charset=utf-8");
}

async function handlePrices(url, res) {
  let day = url.searchParams.get("day") || "today";
  if (day !== "today" && day !== "tomorrow") day = "today";
  let data = await fetchJson("/api/prices", { day });
  if (!data) {
    const hours = day === "today" ? SAMPLE_TODAY : [];
    data = { day, hours, stats: stats(hours), current: null };
  }
  sendJson(res, 200, data);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function handleWeek(res) {
  let data = await fetchJson("/api/prices/week");
  if (!data) {
    const now = new Date();
    data = {
      days: [{
        date: now.toISOString().slice(0, 10),
        day_short: WEEKDAYS[now.getDay()],
        low: 0.02, high: 0.29, avg: 0.1813,
      }],
    };
  }
  sendJson(res, 200, data);
}

async function handleAdvice(pathname, action, res) {
  let data = await fetchJson(pathname);
  if (!data) {
    data = {
      status: "UNKNOWN", action, current_hour: new Date().getHours(),
      current_price: null, classification: "hold", delta_pct: 0,
    };
  }
  sendJson(res, 200, data);
}

function handleSubscribe(req, res) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let email = "";
    try { email = String(JSON.parse(body || "{}").email || "").trim(); } catch { email = ""; }
    if (!email.includes("@") || !email.split("@").pop().includes(".")) {
      return sendJson(res, 422, { detail: "Ongeldig e-mailadres" });
    }
    sendJson(res, 200, { status: "ok", email });
  });
}

async function handleChat(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  let payload = {};
  try { payload = JSON.parse(body || "{}"); } catch { return sendJson(res, 400, { error: "Ongeldige JSON." }); }

  let messages = [];
  if (Array.isArray(payload.messages)) {
    messages = payload.messages.filter((m) => m && typeof m.content === "string" && m.content.trim());
  } else if (typeof payload.message === "string" && payload.message.trim()) {
    messages = [{ role: "user", content: payload.message.trim() }];
  }
  if (!messages.length) return sendJson(res, 400, { error: "Geen bericht meegegeven." });

  try {
    const headers = { "Content-Type": "application/json" };
    if (QWEN_API_KEY) headers.Authorization = "Bearer " + QWEN_API_KEY;
    const resp = await fetch(QWEN_BASE_URL + "/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({ model: QWEN_MODEL, messages, temperature: 0.7, stream: false }),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
      const errText = (await resp.text().catch(() => "")).slice(0, 300);
      return sendJson(res, resp.status, { error: "Model API fout " + resp.status + ": " + errText });
    }
    const data = await resp.json();
    const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return sendJson(res, 200, { reply });
  } catch (err) {
    return sendJson(res, 502, { error: "Lokaal model niet bereikbaar op " + QWEN_BASE_URL + " — " + (err && err.message ? err.message : err) });
  }
}

function handleChatStatus(res) {
  sendJson(res, 200, { keySet: !!QWEN_API_KEY, model: QWEN_MODEL, baseUrl: QWEN_BASE_URL });
}

function serveStatic(pathname, res) {
  const file = path.join(ROOT, path.normalize(pathname));
  if (!file.startsWith(ROOT + path.sep)) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      return send(res, 404, "<h1>404 — Not Found</h1>", "text/html; charset=utf-8");
    }
    send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
  });
}

const OPENAPI = {
  openapi: "3.0.3",
  info: { title: "Stroomprijs API", version: "0.1.0" },
  paths: {
    "/api/prices": { get: { summary: "Hourly prices + stats" } },
    "/api/prices/week": { get: { summary: "Daily stats, last 7 days" } },
    "/api/kopen": { get: { summary: "Buy advice for the current hour" } },
    "/api/verkopen": { get: { summary: "Sell advice for the current hour" } },
    "/health": { get: { summary: "Status" } },
  },
};

// ---- server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname.startsWith("/static/")) return serveStatic(pathname, res);
    if (req.method === "GET" && pathname === "/health") return send(res, 200, "OK", "text/plain; charset=utf-8");
    if (req.method === "POST" && pathname === "/api/subscribe") return handleSubscribe(req, res);
    if (req.method === "POST" && pathname === "/api/chat") return handleChat(req, res);
    if (req.method === "GET" && pathname === "/api/chat/status") return handleChatStatus(res);
    if (req.method === "GET" && pathname === "/api/prices") return handlePrices(url, res);
    if (req.method === "GET" && pathname === "/api/prices/week") return handleWeek(res);
    if (req.method === "GET" && pathname === "/api/kopen") return handleAdvice("/api/kopen", "kopen", res);
    if (req.method === "GET" && pathname === "/api/verkopen") return handleAdvice("/api/verkopen", "verkopen", res);
    if (req.method === "GET" && pathname === "/docs") return sendJson(res, 200, OPENAPI);
    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html" || pathname === "/prices" || pathname === "/gemiddeld")) return handleIndex(res);
    return send(res, 404, "<h1>404 — Not Found</h1>", "text/html; charset=utf-8");
  } catch (err) {
    console.error(err);
    return send(res, 500, "Internal Server Error", "text/plain; charset=utf-8");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`stroomprijs (jesse-website) serving ${ROOT} on http://0.0.0.0:${PORT}`);
});
