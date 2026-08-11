"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 80;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const SCORES_FILE = path.join(DATA_DIR, "scores.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

// ---------- storage ----------

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SCORES_FILE)) fs.writeFileSync(SCORES_FILE, "[]");
}

function readScores() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(SCORES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Serialize writes so concurrent submissions can't clobber each other.
let writeQueue = Promise.resolve();
function writeScores(scores) {
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        ensureDataFile();
        fs.writeFile(SCORES_FILE, JSON.stringify(scores), (err) =>
          err ? reject(err) : resolve()
        );
      })
  );
  return writeQueue;
}

// ---------- leaderboard logic ----------

function isNextDay(dateStr, nextDateStr) {
  const d1 = new Date(dateStr + "T00:00:00Z").getTime();
  const d2 = new Date(nextDateStr + "T00:00:00Z").getTime();
  return d2 - d1 === 86400000;
}

function computeLeaderboard(length) {
  const games = readScores().filter((s) => s.length === length);
  const byPlayer = new Map();
  for (const g of games) {
    if (!byPlayer.has(g.name)) byPlayer.set(g.name, []);
    byPlayer.get(g.name).push(g);
  }

  const result = [];
  for (const [name, playerGames] of byPlayer) {
    playerGames.sort((a, b) => a.date.localeCompare(b.date));
    const played = playerGames.length;
    const wins = playerGames.filter((g) => g.won).length;
    const winPct = played ? Math.round((wins / played) * 100) : 0;
    const winGuesses = playerGames.filter((g) => g.won).map((g) => g.guesses);
    const avgGuesses = winGuesses.length
      ? Math.round((winGuesses.reduce((a, b) => a + b, 0) / winGuesses.length) * 10) / 10
      : null;

    let maxStreak = 0;
    let running = 0;
    let prevDate = null;
    for (const g of playerGames) {
      if (g.won && prevDate && isNextDay(prevDate, g.date)) {
        running += 1;
      } else if (g.won) {
        running = 1;
      } else {
        running = 0;
      }
      maxStreak = Math.max(maxStreak, running);
      prevDate = g.date;
    }

    let currentStreak = 0;
    for (let i = playerGames.length - 1; i >= 0; i--) {
      if (!playerGames[i].won) break;
      if (i === playerGames.length - 1) {
        currentStreak = 1;
      } else if (isNextDay(playerGames[i].date, playerGames[i + 1].date)) {
        currentStreak++;
      } else {
        break;
      }
    }

    result.push({ name, played, wins, winPct, currentStreak, maxStreak, avgGuesses });
  }

  result.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || a.name.localeCompare(b.name));
  return result;
}

function submitScore(body) {
  const { name, length, date, won, guesses } = body;

  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    throw new Error("invalid name");
  }
  if (length !== 5 && length !== 6) {
    throw new Error("invalid length");
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("invalid date");
  }
  if (typeof won !== "boolean") {
    throw new Error("invalid won");
  }
  if (won && (!Number.isInteger(guesses) || guesses < 1 || guesses > length + 1)) {
    throw new Error("invalid guesses");
  }

  const cleanName = name.trim().slice(0, 40);
  const record = {
    name: cleanName,
    length,
    date,
    won,
    guesses: won ? guesses : null,
    submittedAt: new Date().toISOString(),
  };

  const scores = readScores();
  const key = (s) => `${s.name}|${s.date}|${s.length}`;
  const idx = scores.findIndex((s) => key(s) === key(record));
  if (idx >= 0) scores[idx] = record;
  else scores.push(record);

  return writeScores(scores).then(() => record);
}

// ---------- HTTP plumbing ----------

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
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

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJSON(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/leaderboard") {
      const length = Number(url.searchParams.get("length"));
      if (length !== 5 && length !== 6) {
        return sendJSON(res, 400, { error: "length must be 5 or 6" });
      }
      return sendJSON(res, 200, computeLeaderboard(length));
    }

    if (req.method === "POST" && url.pathname === "/api/score") {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return sendJSON(res, 400, { error: "invalid JSON" });
      }
      const record = await submitScore(body);
      return sendJSON(res, 200, record);
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJSON(res, 404, { error: "not found" });
  } catch (err) {
    sendJSON(res, 400, { error: err.message || "bad request" });
  }
});

server.listen(PORT, () => {
  console.log(`Wordly listening on port ${PORT}`);
});
