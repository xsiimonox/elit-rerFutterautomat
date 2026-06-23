const STORAGE_KEY = "futterautomat-vita-demo";
const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const dayValues = [1, 2, 3, 4, 5, 6, 0];
const selectedDays = new Set([1, 2, 3, 4, 5]);
const startedAt = Date.now() - 225200000;

const $ = (id) => document.getElementById(id);

const state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return {
    status: "idle",
    tubeML: 5,
    mlPerSec: 1,
    mixerSpeed: 70,
    maxDoseML: 50,
    ledBrightness: 80,
    ledEffect: "Pulsieren",
    ledColor: "#8b45ff",
    activeML: 0,
    activeFeedAt: 0,
    lastDose: "-",
    firmware: "1.0.0",
    jobs: [
      makeJob("08:00", 20),
      makeJob("12:30", 25),
      makeJob("18:45", 30),
    ],
    log: [{ at: timeText(), message: "GitHub Pages Simulation gestartet" }],
    completedRunKeys: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeJob(time, ml) {
  const [h, m] = time.split(":").map(Number);
  return {
    id: crypto.randomUUID(),
    enabled: true,
    days: [...selectedDays],
    h,
    m,
    ml,
  };
}

function timeText() {
  return new Date().toLocaleTimeString("de-DE");
}

function addLog(message) {
  state.log.push({ at: timeText(), message });
  state.log = state.log.slice(-80);
  saveState();
}

function statusLabel(status) {
  return {
    idle: "Bereit",
    mixing: "Ruehren",
    waiting: "Warten",
    dosing: "Dosieren",
    backflow: "Rueckzug",
  }[status] || status;
}

function renderDays() {
  $("days").innerHTML = dayNames.map((name, index) => {
    const value = dayValues[index];
    const active = selectedDays.has(value) ? " active" : "";
    return `
      <div class="day-wrap">
        <span>${name}</span>
        <button class="day${active}" data-day="${value}" type="button">✓</button>
      </div>
    `;
  }).join("");
}

function nextDoseText() {
  if (!state.jobs.length) return "-";
  const now = new Date();
  const candidates = state.jobs.map((job) => {
    const date = new Date();
    date.setHours(job.h, job.m, 0, 0);
    if (date < now) date.setDate(date.getDate() + 1);
    return { date, job };
  }).sort((a, b) => a.date - b.date);
  const next = candidates[0];
  const prefix = next.date.getDate() === now.getDate() ? "Heute" : "Morgen";
  return `${prefix}, ${String(next.job.h).padStart(2, "0")}:${String(next.job.m).padStart(2, "0")}`;
}

function formatUptime() {
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function setStatus(status, message) {
  state.status = status;
  state.stateStartedAt = Date.now();
  addLog(message || statusLabel(status));
  render();
}

function startCycle(job, feedAt = Date.now()) {
  if (state.status !== "idle") {
    alert("System ist gerade beschaeftigt.");
    return;
  }
  if (!Number.isFinite(job.ml) || job.ml <= 0 || job.ml > state.maxDoseML) {
    alert(`Menge muss zwischen 0 und ${state.maxDoseML} ml liegen.`);
    return;
  }
  state.activeML = job.ml;
  state.activeFeedAt = feedAt;
  setStatus("mixing", `Ruehren gestartet, Dosierung um ${new Date(feedAt).toLocaleTimeString("de-DE")}`);
}

function updateMachine() {
  const elapsed = Date.now() - (state.stateStartedAt || Date.now());

  if (state.status === "mixing" && elapsed >= 20000) {
    setStatus("waiting", "Ruehren beendet, warte auf Dosierzeit");
    return;
  }

  if (state.status === "waiting" && Date.now() >= state.activeFeedAt) {
    setStatus("dosing", `Dosiere ${state.activeML} ml`);
    return;
  }

  if (state.status === "dosing" && elapsed >= (state.activeML / state.mlPerSec) * 1000) {
    setStatus("backflow", `Ziehe ${state.tubeML} ml zurueck`);
    return;
  }

  if (state.status === "backflow" && elapsed >= (state.tubeML / state.mlPerSec) * 1000) {
    state.activeML = 0;
    state.activeFeedAt = 0;
    state.lastDose = `Heute, ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    setStatus("idle", "Bereit");
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

function renderLedMatrix() {
  const matrix = $("ledMatrix");
  if (!matrix.children.length) {
    matrix.innerHTML = Array.from({ length: 64 }, () => '<span class="led-pixel"></span>').join("");
  }
  const opacity = Math.max(0.08, Math.min(1, state.ledBrightness / 100));
  matrix.style.setProperty("--pixel-color", state.ledColor);
  matrix.style.setProperty("--pixel-opacity", opacity);
}

function setControlValue(id, value) {
  const el = $(id);
  if (document.activeElement !== el) el.value = value ?? "";
}

function render() {
  $("status").textContent = statusLabel(state.status);
  $("ip").textContent = "GitHub Pages Demo";
  $("firmware").textContent = state.firmware;
  $("lastDose").textContent = state.lastDose || "-";
  $("nextDose").textContent = nextDoseText();
  $("uptime").textContent = formatUptime();

  setControlValue("tubeML", state.tubeML);
  setControlValue("mixerSpeed", state.mixerSpeed);
  setControlValue("mixerSpeedNumber", state.mixerSpeed);
  setControlValue("ledBrightness", state.ledBrightness);
  setControlValue("ledBrightnessNumber", state.ledBrightness);
  setControlValue("ledColor", state.ledColor);
  setControlValue("ledEffect", state.ledEffect);
  renderLedMatrix();

  $("jobs").innerHTML = state.jobs.map((job) => {
    const time = `${String(job.h).padStart(2, "0")}:${String(job.m).padStart(2, "0")}`;
    return `
      <div class="plan-row" data-job="${job.id}">
        <input class="job-time" type="time" value="${time}">
        <input class="job-ml" type="number" min="0.1" step="0.1" value="${job.ml}">
        <div class="actions">
          <button class="save-job" data-save="${job.id}" type="button">Speichern</button>
          <button class="danger" data-delete="${job.id}" type="button">⌫</button>
        </div>
      </div>
    `;
  }).join("");

  $("log").innerHTML = state.log.slice().reverse().slice(0, 6).map((item) => (
    `<div><strong>${item.at}</strong><span>${item.message}</span></div>`
  )).join("");
}

function addDraftJob() {
  if (document.querySelector(".plan-row.draft")) return;
  const row = document.createElement("div");
  row.className = "plan-row draft";
  row.innerHTML = `
    <input class="job-time" type="time" value="08:00">
    <input class="job-ml" type="number" min="0.1" step="0.1" value="20">
    <div class="actions">
      <button class="save-job" data-create="true" type="button">Speichern</button>
      <button class="danger" data-remove-draft="true" type="button">⌫</button>
    </div>
  `;
  $("jobs").append(row);
}

function saveSettings() {
  state.tubeML = Math.max(0, Number($("tubeML").value));
  state.mlPerSec = 1;
  state.mixerSpeed = Math.max(0, Math.min(100, Number($("mixerSpeed").value)));
  state.ledBrightness = Math.max(0, Math.min(100, Number($("ledBrightness").value)));
  state.ledColor = $("ledColor").value;
  state.ledEffect = $("ledEffect").value;
  addLog("Einstellungen gespeichert");
  render();
}

function syncRange(rangeId, numberId) {
  const range = $(rangeId);
  const number = $(numberId);
  range.addEventListener("input", () => {
    number.value = range.value;
    saveSettings();
  });
  number.addEventListener("input", () => {
    range.value = number.value;
    saveSettings();
  });
}

document.addEventListener("click", (event) => {
  const day = event.target.closest("[data-day]");
  if (day) {
    const value = Number(day.dataset.day);
    if (selectedDays.has(value)) selectedDays.delete(value);
    else selectedDays.add(value);
    renderDays();
    return;
  }

  const cal = event.target.closest("[data-cal]");
  if (cal) {
    startCycle({ id: "manual", ml: Number(cal.dataset.cal) }, Date.now());
    return;
  }

  const save = event.target.closest("[data-save]");
  if (save) {
    const row = save.closest(".plan-row");
    const job = state.jobs.find((item) => item.id === save.dataset.save);
    if (!job) return;
    const [h, m] = row.querySelector(".job-time").value.split(":").map(Number);
    job.h = h;
    job.m = m;
    job.ml = Number(row.querySelector(".job-ml").value);
    job.days = [...selectedDays];
    addLog(`Job gespeichert: ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} / ${job.ml} ml`);
    render();
    return;
  }

  const create = event.target.closest("[data-create]");
  if (create) {
    const row = create.closest(".plan-row");
    const job = makeJob(row.querySelector(".job-time").value, Number(row.querySelector(".job-ml").value));
    state.jobs.push(job);
    addLog(`Job hinzugefuegt: ${String(job.h).padStart(2, "0")}:${String(job.m).padStart(2, "0")} / ${job.ml} ml`);
    render();
    return;
  }

  const del = event.target.closest("[data-delete]");
  if (del) {
    state.jobs = state.jobs.filter((job) => job.id !== del.dataset.delete);
    addLog("Job geloescht");
    render();
    return;
  }

  if (event.target.closest("[data-remove-draft]")) {
    event.target.closest(".plan-row").remove();
  }
});

$("addJobBtn").addEventListener("click", addDraftJob);
$("tubeML").addEventListener("change", saveSettings);
$("ledColor").addEventListener("input", saveSettings);
$("ledEffect").addEventListener("change", saveSettings);
$("clearLogBtn").addEventListener("click", () => {
  state.log = [];
  saveState();
  render();
});

syncRange("mixerSpeed", "mixerSpeedNumber");
syncRange("ledBrightness", "ledBrightnessNumber");
renderDays();
render();

setInterval(() => {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("de-DE");
  $("date").textContent = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  updateMachine();
  checkJobs();
  render();
}, 1000);
