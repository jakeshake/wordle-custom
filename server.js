"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 80;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
// Set TRUST_PROXY=1 when running behind a reverse proxy (Nginx Proxy
// Manager, SWAG, Traefik...) so rate limits key on the real client IP from
// X-Forwarded-For instead of lumping everyone under the proxy's address.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || "");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".txt", ".svg", ".md"]);

// ---------- storage ----------

// One JSON array file per game. Writes are serialized per file so
// concurrent submissions can't clobber each other.
function createStore(fileName) {
  const file = path.join(DATA_DIR, fileName);
  let writeQueue = Promise.resolve();

  function ensure() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  }

  function read() {
    ensure();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(records) {
    writeQueue = writeQueue.then(
      () =>
        new Promise((resolve, reject) => {
          ensure();
          fs.writeFile(file, JSON.stringify(records), (err) => (err ? reject(err) : resolve()));
        })
    );
    return writeQueue;
  }

  return { read, write };
}

const wordlyStore = createStore("scores.json");
const beeStore = createStore("bee.json");
const boxedStore = createStore("boxed.json");

// ---------- shared helpers ----------

function isNextDay(dateStr, nextDateStr) {
  const d1 = new Date(dateStr + "T00:00:00Z").getTime();
  const d2 = new Date(nextDateStr + "T00:00:00Z").getTime();
  return d2 - d1 === 86400000;
}

// Streaks over a player's games sorted by date, where `counts(g)` says
// whether that day extends the streak.
function streaks(games, counts) {
  let maxStreak = 0;
  let running = 0;
  let prevDate = null;
  for (const g of games) {
    if (counts(g) && prevDate && isNextDay(prevDate, g.date)) running += 1;
    else if (counts(g)) running = 1;
    else running = 0;
    maxStreak = Math.max(maxStreak, running);
    prevDate = g.date;
  }

  let currentStreak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (!counts(games[i])) break;
    if (i === games.length - 1) currentStreak = 1;
    else if (isNextDay(games[i].date, games[i + 1].date)) currentStreak++;
    else break;
  }
  return { currentStreak, maxStreak };
}

function groupByPlayer(records) {
  const byPlayer = new Map();
  for (const r of records) {
    if (!byPlayer.has(r.name)) byPlayer.set(r.name, []);
    byPlayer.get(r.name).push(r);
  }
  for (const games of byPlayer.values()) games.sort((a, b) => a.date.localeCompare(b.date));
  return byPlayer;
}

function average(values, decimals = 0) {
  if (!values.length) return null;
  const f = 10 ** decimals;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * f) / f;
}

function minOrNull(values) {
  return values.length ? Math.min(...values) : null;
}

function validName(name) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    throw new Error("invalid name");
  }
  return name.trim().slice(0, 40);
}

function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("invalid date");
  }
  return date;
}

function optionalMs(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 24 * 60 * 60 * 1000) {
    throw new Error(`invalid ${field}`);
  }
  return Math.round(value);
}

function intInRange(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`invalid ${field}`);
  return value;
}

// ---------- Wordly ----------

function computeWordlyLeaderboard(length) {
  const byPlayer = groupByPlayer(wordlyStore.read().filter((s) => s.length === length));
  const result = [];
  for (const [name, games] of byPlayer) {
    const won = games.filter((g) => g.won);
    const played = games.length;
    result.push({
      name,
      played,
      wins: won.length,
      winPct: played ? Math.round((won.length / played) * 100) : 0,
      ...streaks(games, (g) => g.won),
      avgGuesses: average(won.map((g) => g.guesses), 1),
      bestTimeMs: minOrNull(won.filter((g) => Number.isFinite(g.timeMs)).map((g) => g.timeMs)),
      avgLuck: average(won.filter((g) => Number.isFinite(g.luck)).map((g) => g.luck)),
    });
  }
  result.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
  return result;
}

function submitWordlyScore(body) {
  const { length, won, guesses, timeMs, luck } = body;
  const name = validName(body.name);
  const date = validDate(body.date);
  if (length !== 5 && length !== 6) throw new Error("invalid length");
  if (typeof won !== "boolean") throw new Error("invalid won");
  if (won) intInRange(guesses, 1, length + 1, "guesses");
  const time = optionalMs(timeMs, "timeMs");
  if (luck !== undefined && luck !== null) intInRange(luck, 0, 100, "luck");

  const record = {
    name,
    length,
    date,
    won,
    guesses: won ? guesses : null,
    timeMs: won ? time : null,
    luck: won && luck !== undefined && luck !== null ? luck : null,
    submittedAt: new Date().toISOString(),
  };

  const scores = wordlyStore.read();
  const key = (s) => `${s.name}|${s.date}|${s.length}`;
  const idx = scores.findIndex((s) => key(s) === key(record));
  if (idx >= 0) scores[idx] = record;
  else scores.push(record);
  return wordlyStore.write(scores).then(() => record);
}

// ---------- Spelling Bee ----------

const BEE_RANKS = [
  ["Beginner", 0],
  ["Good Start", 0.02],
  ["Moving Up", 0.05],
  ["Good", 0.08],
  ["Solid", 0.15],
  ["Nice", 0.25],
  ["Great", 0.4],
  ["Amazing", 0.5],
  ["Genius", 0.7],
  ["Queen Bee", 1],
];

function beeRank(score, max) {
  let name = BEE_RANKS[0][0];
  for (const [rank, pct] of BEE_RANKS) {
    const needed = pct === 1 ? max : Math.round(pct * max);
    if (score >= needed) name = rank;
  }
  return name;
}

function beeIsGenius(r) {
  return r.score >= Math.round(0.7 * r.maxScore);
}

function computeBeeLeaderboard(date) {
  const records = beeStore.read();

  const today = records
    .filter((r) => r.date === date)
    .map((r) => ({
      name: r.name,
      score: r.score,
      maxScore: r.maxScore,
      rank: beeRank(r.score, r.maxScore),
      words: r.words,
      pangrams: r.pangrams,
      geniusMs: r.geniusMs,
    }))
    .sort((a, b) => b.score - a.score || (a.geniusMs ?? Infinity) - (b.geniusMs ?? Infinity) || a.name.localeCompare(b.name));

  const overall = [];
  for (const [name, games] of groupByPlayer(records)) {
    overall.push({
      name,
      played: games.length,
      avgPct: average(games.map((g) => (g.maxScore ? (g.score / g.maxScore) * 100 : 0))),
      geniusDays: games.filter(beeIsGenius).length,
      queenBeeDays: games.filter((g) => g.score >= g.maxScore).length,
      pangrams: games.reduce((sum, g) => sum + (g.pangrams || 0), 0),
      ...streaks(games, () => true),
      bestGeniusMs: minOrNull(games.filter((g) => Number.isFinite(g.geniusMs)).map((g) => g.geniusMs)),
    });
  }
  overall.sort(
    (a, b) => b.geniusDays - a.geniusDays || b.avgPct - a.avgPct || b.played - a.played || a.name.localeCompare(b.name)
  );
  return { today, overall };
}

function submitBeeScore(body) {
  const name = validName(body.name);
  const date = validDate(body.date);
  const maxScore = intInRange(body.maxScore, 1, 5000, "maxScore");
  const score = intInRange(body.score, 0, maxScore, "score");
  const words = intInRange(body.words, 0, 1000, "words");
  const pangrams = intInRange(body.pangrams, 0, 100, "pangrams");
  let geniusMs = optionalMs(body.geniusMs, "geniusMs");
  if (score < Math.round(0.7 * maxScore)) geniusMs = null;

  const records = beeStore.read();
  const idx = records.findIndex((r) => r.name === name && r.date === date);
  const prev = idx >= 0 ? records[idx] : null;
  // Scores only go up during a day; if a stale device reports a lower
  // score, keep the better one (and the faster Genius time).
  const record = {
    name,
    date,
    score: prev ? Math.max(prev.score, score) : score,
    maxScore,
    words: prev && prev.score > score ? prev.words : words,
    pangrams: prev && prev.score > score ? prev.pangrams : pangrams,
    geniusMs: minOrNull([prev && prev.geniusMs, geniusMs].filter(Number.isFinite)),
    submittedAt: new Date().toISOString(),
  };
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  return beeStore.write(records).then(() => ({ ...record, rank: beeRank(record.score, record.maxScore) }));
}

// ---------- Letter Boxed ----------

function computeBoxedLeaderboard(date) {
  const records = boxedStore.read();

  const today = records
    .filter((r) => r.date === date)
    .map((r) => ({ name: r.name, words: r.words, par: r.par, timeMs: r.timeMs }))
    .sort((a, b) => a.words - b.words || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || a.name.localeCompare(b.name));

  const overall = [];
  for (const [name, games] of groupByPlayer(records)) {
    overall.push({
      name,
      solved: games.length,
      avgWords: average(games.map((g) => g.words), 1),
      bestWords: minOrNull(games.map((g) => g.words)),
      twoWordSolves: games.filter((g) => g.words <= 2).length,
      parOrBetter: games.filter((g) => Number.isFinite(g.par) && g.words <= g.par).length,
      bestTimeMs: minOrNull(games.filter((g) => Number.isFinite(g.timeMs)).map((g) => g.timeMs)),
      ...streaks(games, () => true),
    });
  }
  overall.sort(
    (a, b) => b.solved - a.solved || (a.avgWords ?? Infinity) - (b.avgWords ?? Infinity) || a.name.localeCompare(b.name)
  );
  return { today, overall };
}

function submitBoxedScore(body) {
  const name = validName(body.name);
  const date = validDate(body.date);
  const words = intInRange(body.words, 1, 100, "words");
  const par = body.par === undefined || body.par === null ? null : intInRange(body.par, 1, 20, "par");
  const timeMs = optionalMs(body.timeMs, "timeMs");

  const records = boxedStore.read();
  const existing = records.find((r) => r.name === name && r.date === date);
  // First solve of the day is the one that counts - no replaying on a
  // second device for a better result.
  if (existing) return Promise.resolve(existing);
  const record = { name, date, words, par, timeMs, submittedAt: new Date().toISOString() };
  records.push(record);
  return boxedStore.write(records).then(() => record);
}

// ---------- rate limiting ----------

// Fixed-window counters per client IP. Writes are the thing worth
// protecting (each one rewrites a JSON file); reads get a looser cap.
const RATE_LIMITS = {
  write: { max: Number(process.env.RATE_LIMIT_WRITES) || 30, windowMs: 60_000 },
  read: { max: Number(process.env.RATE_LIMIT_READS) || 120, windowMs: 60_000 },
};
const rateBuckets = new Map();

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

// Returns 0 if allowed, otherwise seconds until the window resets.
function rateLimited(req, kind) {
  const { max, windowMs } = RATE_LIMITS[kind];
  const key = `${kind}|${clientIp(req)}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  return bucket.count > max ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now >= bucket.resetAt) rateBuckets.delete(key);
}, 60_000).unref();

// ---------- HTTP plumbing ----------

function sendJSON(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 10_000) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function readJSONBody(req) {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON");
  }
}

// Gzipped copies of text assets, cached by path + mtime. The Letter Boxed
// dictionary is ~1.4 MB raw but under 400 KB gzipped.
const gzipCache = new Map();

function resolveStatic(pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  // Clean game URLs: /wordly -> wordly.html, /bee -> bee.html, ...
  if (!path.extname(rel)) rel += ".html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  return filePath.startsWith(PUBLIC_DIR + path.sep) ? filePath : null;
}

function serveStatic(req, pathname, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const filePath = resolveStatic(decoded);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      // Revalidate every load so a freshly pulled image shows up right away.
      "Cache-Control": "no-cache",
      "Last-Modified": stat.mtime.toUTCString(),
    };
    const since = Date.parse(req.headers["if-modified-since"] || "");
    if (Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      if (COMPRESSIBLE.has(ext) && data.length > 1024) {
        headers.Vary = "Accept-Encoding";
        if (acceptsGzip) {
          const cacheKey = `${filePath}|${stat.mtimeMs}`;
          let gz = gzipCache.get(cacheKey);
          if (!gz) {
            gz = zlib.gzipSync(data, { level: 9 });
            gzipCache.set(cacheKey, gz);
          }
          headers["Content-Encoding"] = "gzip";
          data = gz;
        }
      }
      headers["Content-Length"] = data.length;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
}

// method + path -> { limit, handler(url, req) -> Promise<object> | object }
const ROUTES = {
  "GET /api/health": { handler: () => ({ ok: true }) },

  // Wordly (original paths kept so older cached pages keep working)
  "GET /api/leaderboard": {
    limit: "read",
    handler: (url) => {
      const length = Number(url.searchParams.get("length"));
      if (length !== 5 && length !== 6) throw new Error("length must be 5 or 6");
      return computeWordlyLeaderboard(length);
    },
  },
  "POST /api/score": {
    limit: "write",
    handler: async (url, req) => submitWordlyScore(await readJSONBody(req)),
  },

  "GET /api/bee/leaderboard": {
    limit: "read",
    handler: (url) => computeBeeLeaderboard(validDate(url.searchParams.get("date"))),
  },
  "POST /api/bee/score": {
    limit: "write",
    handler: async (url, req) => submitBeeScore(await readJSONBody(req)),
  },

  "GET /api/boxed/leaderboard": {
    limit: "read",
    handler: (url) => computeBoxedLeaderboard(validDate(url.searchParams.get("date"))),
  },
  "POST /api/boxed/score": {
    limit: "write",
    handler: async (url, req) => submitBoxedScore(await readJSONBody(req)),
  },
};

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const route = ROUTES[`${req.method} ${url.pathname}`];
  if (route) {
    if (route.limit) {
      const retryAfter = rateLimited(req, route.limit);
      if (retryAfter) {
        return sendJSON(res, 429, { error: "too many requests" }, { "Retry-After": String(retryAfter) });
      }
    }
    try {
      return sendJSON(res, 200, await route.handler(url, req));
    } catch (err) {
      return sendJSON(res, 400, { error: err.message || "bad request" });
    }
  }

  if (url.pathname.startsWith("/api/")) return sendJSON(res, 404, { error: "not found" });
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, url.pathname, res);
  sendJSON(res, 405, { error: "method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Wordly listening on port ${PORT}`);
});
