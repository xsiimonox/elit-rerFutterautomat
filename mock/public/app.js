const state = {
  status: "idle",
  jobs: [],
  log: [],
};

const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const dayValues = [1, 2, 3, 4, 5, 6, 0];
const selectedDays = new Set([1, 2, 3, 4, 5]);
const startedAt = Date.now() - 225200000;

const $ = (id) => document.getElementById(id);

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  }).then((res) => res.json());
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
  if (!state.jobs?.length) return "-";
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

function setControlValue(id, value) {
  const el = $(id);
  if (document.activeElement !== el) el.value = value ?? "";
}

function renderLedMatrix() {
  const matrix = $("ledMatrix");
  if (!matrix.children.length) {
    matrix.innerHTML = Array.from({ length: 64 }, () => '<span class="led-pixel"></span>').join("");
  }
  const color = state.ledColor || "#8b45ff";
  const opacity = Math.max(0.08, Math.min(1, (state.ledBrightness ?? 80) / 100));
  matrix.style.setProperty("--pixel-color", color);
  matrix.style.setProperty("--pixel-opacity", opacity);
}

function render(next) {
  Object.assign(state, next);

  $("status").textContent = statusLabel(state.status);
  $("ip").textContent = state.ip || location.host;
  $("firmware").textContent = state.firmware || "1.0.0";
  $("lastDose").textContent = state.lastDose || "-";
  $("nextDose").textContent = nextDoseText();
  $("uptime").textContent = formatUptime();

  setControlValue("tubeML", state.tubeML);
  setControlValue("mixerSpeed", state.mixerSpeed);
  setControlValue("mixerSpeedNumber", state.mixerSpeed);
  setControlValue("ledBrightness", state.ledBrightness ?? 80);
  setControlValue("ledBrightnessNumber", state.ledBrightness ?? 80);
  setControlValue("ledColor", state.ledColor || "#8b45ff");
  setControlValue("ledEffect", state.ledEffect || "Pulsieren");
  renderLedMatrix();

  $("jobs").innerHTML = (state.jobs || []).map((job) => {
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

  $("log").innerHTML = (state.log || []).slice().reverse().slice(0, 6).map((item) => (
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

async function saveSettings() {
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      tubeML: Number($("tubeML").value),
      mlPerSec: 1,
      mixerSpeed: Number($("mixerSpeed").value),
      maxDoseML: 50,
      ledBrightness: Number($("ledBrightness").value),
      ledEffect: $("ledEffect").value,
      ledColor: $("ledColor").value,
    }),
  });
  if (!result.ok) alert(result.error);
}

function connectWs() {
  const ws = new WebSocket(`ws://${location.host}/ws`);

  ws.addEventListener("message", (event) => {
    render(JSON.parse(event.data));
  });

  ws.addEventListener("close", () => {
    setTimeout(connectWs, 1000);
  });
}

document.addEventListener("click", async (event) => {
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
    const ml = Number(cal.dataset.cal);
    const result = await api("/api/dose", { method: "POST", body: JSON.stringify({ ml }) });
    if (!result.ok) alert(result.error);
    return;
  }

  const save = event.target.closest("[data-save]");
  if (save) {
    const row = save.closest(".plan-row");
    const body = {
      time: row.querySelector(".job-time").value,
      ml: Number(row.querySelector(".job-ml").value),
      days: [...selectedDays],
    };
    const result = await api(`/api/job/${encodeURIComponent(save.dataset.save)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!result.ok) alert(result.error);
    return;
  }

  const create = event.target.closest("[data-create]");
  if (create) {
    const row = create.closest(".plan-row");
    const result = await api("/api/job", {
      method: "POST",
      body: JSON.stringify({
        time: row.querySelector(".job-time").value,
        ml: Number(row.querySelector(".job-ml").value),
        days: [...selectedDays],
      }),
    });
    if (!result.ok) alert(result.error);
    return;
  }

  const del = event.target.closest("[data-delete]");
  if (del) {
    await api(`/api/job/${encodeURIComponent(del.dataset.delete)}`, { method: "DELETE" });
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
  api("/api/log", { method: "DELETE" });
});

syncRange("mixerSpeed", "mixerSpeedNumber");
syncRange("ledBrightness", "ledBrightnessNumber");

setInterval(() => {
  const now = new Date();
  $("clock").textContent = now.toLocaleTimeString("de-DE");
  $("date").textContent = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  $("uptime").textContent = formatUptime();
}, 1000);

renderDays();
renderLedMatrix();
api("/api/state").then((initial) => {
  if (!initial.jobs?.length) {
    Promise.all([
      api("/api/job", { method: "POST", body: JSON.stringify({ time: "08:00", ml: 20, days: [...selectedDays] }) }),
      api("/api/job", { method: "POST", body: JSON.stringify({ time: "12:30", ml: 25, days: [...selectedDays] }) }),
      api("/api/job", { method: "POST", body: JSON.stringify({ time: "18:45", ml: 30, days: [...selectedDays] }) }),
    ]).then(() => api("/api/state").then(render));
  } else {
    render(initial);
  }
});
connectWs();
