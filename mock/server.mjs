import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8080);

const state = {
  status: "idle",
  tubeML: 5,
  mlPerSec: 1,
  mixerSpeed: 70,
  maxDoseML: 50,
  ledBrightness: 80,
  ledEffect: "Pulsieren",
  ledColor: "#8b45ff",
  jobs: [],
  log: [],
  activeML: 0,
  activeFeedAt: 0,
  activeJobId: "",
  stateStartedAt: Date.now(),
  completedRunKeys: [],
  lastDose: "Heute, 12:30",
  firmware: "1.0.0",
};

const clients = new Set();

function addLog(message) {
  const item = {
    at: new Date().toLocaleTimeString("de-DE"),
    message,
  };
  state.log.push(item);
  state.log = state.log.slice(-80);
}

function publicState() {
  return {
    status: state.status,
    tubeML: state.tubeML,
    mlPerSec: state.mlPerSec,
    mixerSpeed: state.mixerSpeed,
    maxDoseML: state.maxDoseML,
    ledBrightness: state.ledBrightness,
    ledEffect: state.ledEffect,
    ledColor: state.ledColor,
    jobs: state.jobs,
    log: state.log,
    activeML: state.activeML,
    activeFeedAt: state.activeFeedAt,
    lastDose: state.lastDose,
    firmware: state.firmware,
    ip: `localhost:${port}`,
  };
}

function setStatus(status, message = status) {
  state.status = status;
  state.stateStartedAt = Date.now();
  addLog(message);
  broadcast({ type: "state", ...publicState() });
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  const frame = wsFrame(data);
  for (const socket of clients) {
    if (!socket.destroyed) socket.write(frame);
  }
}

function wsFrame(text) {
  const payload = Buffer.from(text);
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  return Buffer.concat([Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]), payload]);
}

function validateDose(ml) {
  if (!Number.isFinite(ml) || ml <= 0) return "Menge muss groesser als 0 ml sein.";
  if (ml > state.maxDoseML) return `Maximal ${state.maxDoseML} ml erlaubt.`;
  if (state.mlPerSec <= 0) return "Kalibrierung ml/s muss groesser als 0 sein.";
  return "";
}

function startCycle(job, feedAt = Date.now()) {
  if (state.status !== "idle") return { ok: false, error: "System ist gerade beschaeftigt." };
  const error = validateDose(job.ml);
  if (error) return { ok: false, error };

  state.activeML = job.ml;
  state.activeFeedAt = feedAt;
  state.activeJobId = job.id || "";
  setStatus("mixing", `Ruehren gestartet, Dosierung um ${new Date(feedAt).toLocaleTimeString("de-DE")}`);
  return { ok: true };
}

function startManualDose(ml) {
  return startCycle({ id: "manual", ml }, Date.now());
}

function updateMachine() {
  const elapsed = Date.now() - state.stateStartedAt;

  if (state.status === "mixing" && elapsed >= 20000) {
    setStatus("waiting", "Ruehren beendet, warte auf Dosierzeit");
    return;
  }

  if (state.status === "waiting" && Date.now() >= state.activeFeedAt) {
    setStatus("dosing", `Dosiere ${state.activeML} ml`);
    return;
  }

  if (state.status === "dosing") {
    if (elapsed > (state.activeML / state.mlPerSec) * 1000) {
      setStatus("backflow", `Ziehe ${state.tubeML} ml zurueck`);
    }
    return;
  }

  if (state.status === "backflow") {
    if (elapsed > (state.tubeML / state.mlPerSec) * 1000) {
      state.activeML = 0;
      state.activeFeedAt = 0;
      state.activeJobId = "";
      state.lastDose = `Heute, ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
      setStatus("idle", "Bereit");
    }
  }
}

function checkJobs() {
  if (state.status !== "idle") return;
  const now = new Date();
  const weekday = now.getDay();

  for (const job of state.jobs) {
    if (!job.enabled || !job.days.includes(weekday)) continue;

    const feedAt = new Date(now);
    feedAt.setHours(job.h, job.m, 0, 0);
    const startAt = feedAt.getTime() - 30000;
    const key = `${feedAt.toDateString()}-${job.id}`;

    if (state.completedRunKeys.includes(key)) continue;
    if (Date.now() >= startAt && Date.now() < feedAt.getTime() + 60000) {
      state.completedRunKeys.push(key);
      state.completedRunKeys = state.completedRunKeys.slice(-100);
      startCycle(job, feedAt.getTime());
      return;
    }
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(publicDir, requested));

  if (!file.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, publicState());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/job") {
      const body = await readJson(req);
      const [h, m] = String(body.time || "").split(":").map(Number);
      const ml = Number(body.ml);
      if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isFinite(ml) || ml <= 0) {
        sendJson(res, 400, { ok: false, error: "Ungueltige Zeit oder Menge." });
        return;
      }
      if (state.jobs.length >= 20) {
        sendJson(res, 400, { ok: false, error: "Maximal 20 Jobs erlaubt." });
        return;
      }
      state.jobs.push({
        id: crypto.randomUUID(),
        enabled: true,
        days: Array.isArray(body.days) && body.days.length ? body.days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
        h,
        m,
        ml,
      });
      addLog(`Job hinzugefuegt: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} / ${ml} ml`);
      broadcast({ type: "state", ...publicState() });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/job/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/job/".length));
      state.jobs = state.jobs.filter((job) => job.id !== id);
      addLog("Job geloescht");
      broadcast({ type: "state", ...publicState() });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/api/job/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/job/".length));
      const body = await readJson(req);
      const job = state.jobs.find((item) => item.id === id);
      const [h, m] = String(body.time || "").split(":").map(Number);
      const ml = Number(body.ml);
      if (!job || !Number.isInteger(h) || !Number.isInteger(m) || !Number.isFinite(ml) || ml <= 0) {
        sendJson(res, 400, { ok: false, error: "Ungueltiger Job." });
        return;
      }
      job.h = h;
      job.m = m;
      job.ml = ml;
      job.days = Array.isArray(body.days) && body.days.length ? body.days.map(Number) : job.days;
      addLog(`Job gespeichert: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} / ${ml} ml`);
      broadcast({ type: "state", ...publicState() });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readJson(req);
      state.tubeML = Math.max(0, Number(body.tubeML));
      state.mlPerSec = Math.max(0.01, Number(body.mlPerSec));
      state.mixerSpeed = Math.max(0, Math.min(100, Number(body.mixerSpeed)));
      state.maxDoseML = Math.max(1, Number(body.maxDoseML));
      state.ledBrightness = Math.max(0, Math.min(100, Number(body.ledBrightness ?? state.ledBrightness)));
      state.ledEffect = String(body.ledEffect || state.ledEffect);
      state.ledColor = String(body.ledColor || state.ledColor);
      addLog("Einstellungen gespeichert");
      broadcast({ type: "state", ...publicState() });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/dose") {
      const body = await readJson(req);
      sendJson(res, 200, startManualDose(Number(body.ml)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      state.activeML = 0;
      state.activeFeedAt = 0;
      state.activeJobId = "";
      setStatus("idle", "Manuell gestoppt");
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/log") {
      state.log = [];
      broadcast({ type: "state", ...publicState() });
      sendJson(res, 200, { ok: true });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  clients.add(socket);
  socket.write(wsFrame(JSON.stringify({ type: "state", ...publicState() })));
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

setInterval(() => {
  updateMachine();
  checkJobs();
}, 250);

addLog("Mock gestartet");
server.listen(port, () => {
  console.log(`Futterautomat Vita Mock: http://localhost:${port}`);
});
