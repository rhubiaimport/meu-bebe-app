const STORAGE_KEY = "meu-bebe:v1";
const DEFAULT_FEED_INTERVAL_HOURS = 3;

// Estado central do app. No futuro, esta camada pode ser trocada por login,
// API e banco online sem mudar a interface nem os formulários.
const initialState = {
  activeBabyId: "baby-1",
  settings: {
    visualAlerts: true,
    softNight: false,
    feedIntervalHours: DEFAULT_FEED_INTERVAL_HOURS
  },
  babies: [
    {
      id: "baby-1",
      name: "Bebê",
      birthDate: "",
      sex: "",
      weight: "",
      height: "",
      photo: "assets/baby-clouds.png",
      settings: {},
      records: []
    }
  ]
};

const typeMeta = {
  feed: { label: "Mamada", icon: "🍼" },
  milk: { label: "Leite", icon: "🧊" },
  diaper: { label: "Fralda", icon: "☁" },
  medicine: { label: "Remédio", icon: "💊" },
  appointment: { label: "Consulta", icon: "🩺" },
  growth: { label: "Crescimento", icon: "📏" },
  pee: { label: "Xixi", icon: "💧" },
  poop: { label: "Cocô", icon: "☁" },
  sleep: { label: "Sono", icon: "☾" }
};

const formTargets = {
  feed: { form: "feed" },
  milk: { form: "milk" },
  poop: { form: "diaper", diaperType: "Cocô" },
  pee: { form: "diaper", diaperType: "Xixi" },
  medicine: { form: "medicine" },
  appointment: { form: "appointment" },
  growth: { form: "growth" }
};

const eliminationConfig = {
  poop: {
    type: "Cocô",
    icon: "💩",
    singular: "cocô",
    plural: "cocôs",
    question: "Quantas vezes seu bebê fez cocô hoje?",
    feedback: "✅ Cocô registrado.",
    deleteMessage: "Deseja realmente excluir este registro?"
  },
  pee: {
    type: "Xixi",
    icon: "💧",
    singular: "xixi",
    plural: "xixis",
    question: "Quantas vezes seu bebê fez xixi hoje?",
    feedback: "✅ Xixi registrado.",
    deleteMessage: "Deseja realmente excluir este registro?"
  }
};

let state = loadState();
let pendingFeedId = null;
let lastQuickFeedStamp = 0;
let feedNotificationTimers = [];
let milkNotificationTimers = [];
let medicineNotificationTimers = [];
let appointmentNotificationTimers = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.babies)) return structuredClone(initialState);
    return repairState(saved);
  } catch {
    return structuredClone(initialState);
  }
}

// Corrige dados incompletos ou antigos antes de salvar/renderizar.
function repairState(data) {
  const repaired = {
    ...structuredClone(initialState),
    ...data,
    settings: { ...initialState.settings, ...(data.settings || {}) },
    babies: (data.babies || []).filter(Boolean).map((baby, index) => ({
      id: baby.id || crypto.randomUUID(),
      name: String(baby.name || `Bebê ${index + 1}`).trim(),
      birthDate: baby.birthDate || "",
      sex: baby.sex || "",
      weight: cleanNumber(baby.weight),
      height: cleanNumber(baby.height),
      photo: baby.photo || "assets/baby-clouds.png",
      settings: { ...(baby.settings || {}) },
      records: Array.isArray(baby.records) ? baby.records.filter((record) => record && record.type) : []
    }))
  };

  if (!repaired.babies.length) repaired.babies = structuredClone(initialState.babies);
  if (!repaired.babies.some((baby) => baby.id === repaired.activeBabyId)) {
    repaired.activeBabyId = repaired.babies[0].id;
  }
  return repaired;
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(value) : "";
}

function feedIntervalMinutes() {
  const hours = Number(state.settings.feedIntervalHours || DEFAULT_FEED_INTERVAL_HOURS);
  return [2, 3, 4].includes(hours) ? hours * 60 : DEFAULT_FEED_INTERVAL_HOURS * 60;
}

function parseMl(value) {
  const number = Number(String(value || "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function recordCount(record) {
  const number = Number(record.count);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function dateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInput();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function saveState() {
  state = repairState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function activeBaby() {
  return state.babies.find((baby) => baby.id === state.activeBabyId) || state.babies[0];
}

function nowLocalInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateTimeOrNow(date, time) {
  if (date && time) return `${date}T${time}`;
  if (date) return `${date}T12:00`;
  if (time) return `${todayInput()}T${time}`;
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: value.length > 10 ? "short" : undefined
  }).format(date);
}

function formatClock(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatOnlyDate(value) {
  if (!value) return "--/--/----";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/--/----";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function formatFullDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  return `${day} às ${formatClock(date)}`;
}

function formatDuration(ms) {
  const abs = Math.max(0, Math.floor(Math.abs(ms) / 60000));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function formatLongRemaining(ms) {
  if (ms <= 0) return "Vencido";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  if (months > 0) return `${months} ${months === 1 ? "mês" : "meses"} e ${days % 30} dia${days % 30 === 1 ? "" : "s"}`;
  if (days > 0) return `${days} dia${days === 1 ? "" : "s"} e ${hours % 24} hora${hours % 24 === 1 ? "" : "s"}`;
  return formatDuration(ms);
}

function addTime(value, minutes) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + minutes * 60000);
}

function addMonths(value, months) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMonth(date.getMonth() + months);
  return date;
}

function todayRecords(records) {
  const today = new Date().toDateString();
  return records.filter((record) => new Date(record.date || record.createdAt).toDateString() === today);
}

function ageText(birthDate) {
  if (!birthDate) return "Nascimento não informado";
  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  if (birth > today || Number.isNaN(birth.getTime())) return "Data de nascimento a confirmar";
  const days = Math.max(0, Math.floor((today - birth) / 86400000));
  if (days < 30) return `${days} dia${days === 1 ? "" : "s"}`;

  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const anchor = new Date(birth);
  anchor.setMonth(birth.getMonth() + months);
  const extraDays = Math.max(0, Math.floor((today - anchor) / 86400000));
  if (years) return `${years} ano${years > 1 ? "s" : ""} e ${rest} mês${rest === 1 ? "" : "es"}`;
  return `${months} mês${months === 1 ? "" : "es"} e ${extraDays} dia${extraDays === 1 ? "" : "s"}`;
}

function addRecord(type, payload = {}) {
  const baby = activeBaby();
  baby.records.unshift({
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    date: payload.date || payload.next || payload.expires || new Date().toISOString(),
    ...payload
  });
  saveState();
  toast(`${typeMeta[type]?.label || "Registro"} salvo`);
}

function removeRecord(id) {
  const baby = activeBaby();
  baby.records = baby.records.filter((record) => record.id !== id);
  saveState();
  toast("Registro removido");
}

function findRecord(id) {
  return activeBaby().records.find((record) => record.id === id);
}

function updateRecord(id, updates) {
  const record = findRecord(id);
  if (!record) return;
  Object.assign(record, updates);
  saveState();
}

function registerQuickFeed(method) {
  const now = Date.now();
  if (now - lastQuickFeedStamp < 800) return;
  lastQuickFeedStamp = now;
  const baby = activeBaby();
  const record = {
    id: crypto.randomUUID(),
    type: "feed",
    feedType: method === "bottle" ? "Mamadeira" : "Peito",
    amount: "",
    note: "",
    createdAt: new Date().toISOString(),
    date: new Date().toISOString()
  };
  baby.records.unshift(record);
  pendingFeedId = method === "breast" ? record.id : null;
  saveState();
  if (method === "breast") {
    showFeedTypePicker();
    showFeedFeedback("✅ Mamada registrada. Informe o lado quando puder.");
  } else {
    hideFeedTypePicker();
    showFeedFeedback("✅ Mamada de mamadeira registrada.");
  }
  requestNotificationPermission();
}

function showFeedQuickChoices() {
  $("#feedQuickChoice").classList.toggle("show");
  $("#feedQuickChoice").scrollIntoView({ behavior: "smooth", block: "center" });
}

function registerManualFeed(time, date, feedType) {
  const baseDate = date || todayInput();
  addRecord("feed", {
    feedType,
    note: "",
    date: dateTimeOrNow(baseDate, time)
  });
  showFeedFeedback();
  requestNotificationPermission();
}

function showFeedTypePicker() {
  $("#feedTypePicker").classList.remove("hidden");
}

function hideFeedTypePicker() {
  $("#feedTypePicker").classList.add("hidden");
}

function showFeedFeedback(message = "✅ Mamada registrada com sucesso.") {
  const feedback = $("#feedFeedback");
  feedback.textContent = message;
  feedback.classList.add("show");
  window.clearTimeout(feedback.timer);
  feedback.timer = window.setTimeout(() => feedback.classList.remove("show"), 2600);
}

function registerMilk(time, date, amount, side = "") {
  const baseDate = date || todayInput();
  addRecord("milk", {
    amount: amount ? `${Math.round(Number(amount))} ml` : "",
    side,
    note: "",
    date: dateTimeOrNow(baseDate, time)
  });
  showMilkFeedback();
  requestNotificationPermission();
}

function showMilkForm() {
  const form = $("#milkForm");
  form.classList.remove("hidden");
  setDefaultDateFields(form);
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideMilkForm() {
  $("#milkForm").classList.add("hidden");
}

function showMilkFeedback(message = "✅ Retirada registrada com sucesso.") {
  const feedback = $("#milkFeedback");
  feedback.textContent = message;
  feedback.classList.add("show");
  window.clearTimeout(feedback.timer);
  feedback.timer = window.setTimeout(() => feedback.classList.remove("show"), 2600);
}

// Renderizacao sempre deriva do estado atual, mantendo os cartoes sincronizados.
function render() {
  const baby = activeBaby();
  document.body.classList.toggle("soft-night", Boolean(state.settings.softNight));
  $("#babyNameHero").textContent = baby.name;
  $("#babyAge").textContent = ageText(baby.birthDate);
  $("#babyWeightHero").textContent = baby.weight || "--";
  $("#babyHeightHero").textContent = baby.height || "--";
  const growthSummary = getGrowthSummary(baby);
  $("#babyWeightTrend").textContent = growthSummary.weightTrend;
  $("#babyHeightTrend").textContent = growthSummary.heightTrend;
  $("#babyPhoto").src = baby.photo || "assets/baby-clouds.png";
  $("#alertsToggle").checked = Boolean(state.settings.visualAlerts);

  renderProfileForm(baby);
  renderWelcomePanel(baby);
  renderGrowthView(baby);
  renderDashboard(baby);
  renderFeedView(baby);
  renderMilkView(baby);
  renderEliminationView("poop", baby);
  renderEliminationView("pee", baby);
  renderMedicineView(baby);
  renderAppointmentView(baby);
  renderTimeline(baby);
  renderProfiles();
  renderAlerts(baby);
  scheduleNotifications(baby);
}

function renderProfileForm(baby) {
  const form = $("#profileForm");
  form.name.value = baby.name;
  form.birthDate.value = baby.birthDate || "";
  form.sex.value = baby.sex || "";
  form.weight.value = baby.weight || "";
  form.height.value = baby.height || "";
}

function renderWelcomePanel(baby) {
  const shouldShow = !localStorage.getItem(`${STORAGE_KEY}:welcomed`) && (!baby.name || baby.name === "Bebê");
  $("#welcomePanel")?.classList.toggle("hidden", !shouldShow);
}

function renderDashboard(baby) {
  const records = baby.records;
  const feed = getFeedSummary(records);
  const milk = getMilkSummary(records);
  const diaper = getDiaperSummary(records);
  const medicine = getMedicineSummary(records);
  const appointment = getAppointmentSummary(records);
  const growth = getGrowthSummary(baby);

  const cards = [
    {
      key: "profile",
      title: "Dados do bebê",
      icon: "👶🏽",
      lines: [
        ["Nome", baby.name],
        ["Idade", ageText(baby.birthDate)],
        ["⚖️ Peso atual", `${baby.weight || "--"} kg · ${growth.weightStatus}`],
        ["Diferença", growth.weightTrend],
        ["📏 Tamanho atual", `${baby.height || "--"} cm · ${growth.heightTrend}`]
      ]
    },
    {
      key: "feed",
      title: "Mamadas",
      icon: "🍼",
      lines: [
        ["Última", feed.lastTime],
        ["Próxima", feed.nextTime],
        ["Faltam", feed.countdown],
        ["Já passou", feed.elapsed]
      ]
    },
    {
      key: "milk",
      title: "Leite materno",
      icon: "🤱",
      lines: [
        ["Última retirada", milk.lastTime],
        ["Quantidade", milk.amount],
        ["🏠 Ambiente", milk.ambient],
        ["❄️ Geladeira", milk.fridge],
        ["🧊 Congelador", milk.freezer],
        ["Tempo restante", milk.remaining]
      ]
    },
    {
      key: "poop",
      title: "Cocô",
      icon: "💩",
      lines: [
        ["Cocôs hoje", diaper.poopCount],
        ["Último registro", diaper.lastPoop]
      ]
    },
    {
      key: "pee",
      title: "Xixi",
      icon: "💧",
      lines: [
        ["Xixis hoje", diaper.peeCount],
        ["Último registro", diaper.lastPee]
      ]
    },
    {
      key: "medicine",
      title: "Remédios",
      icon: "💊",
      lines: [
        ["Próximo remédio", medicine.name],
        ["Horário", medicine.time],
        ["Faltam", medicine.countdown]
      ]
    },
    {
      key: "appointment",
      title: "Consultas",
      icon: "🩺",
      lines: [
        ["Especialidade", appointment.doctor],
        ["📅 Data", appointment.date],
        ["🕒 Horário", appointment.time]
      ]
    }
  ];

  $("#dashboardCards").innerHTML = cards.map((card) => `
    <article class="home-card" data-home-card="${esc(card.key)}" tabindex="0" role="button" aria-label="Abrir ${esc(card.title)}">
      <header>
        <span>${esc(card.icon)}</span>
        <h3>${esc(card.title)}</h3>
      </header>
      <div class="home-card-lines">
        ${card.lines.map(([label, value]) => `
          <div>
            <small>${esc(label)}</small>
            <strong>${esc(value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function getGrowthSummary(baby) {
  const growthRecords = baby.records
    .filter((record) => record.type === "growth")
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  const current = growthRecords[0] || { weight: baby.weight, height: baby.height };
  const previous = growthRecords[1];
  const weightDiff = previous ? Math.round((Number(current.weight || 0) - Number(previous.weight || 0)) * 1000) : 0;
  const heightDiff = previous ? Number((Number(current.height || 0) - Number(previous.height || 0)).toFixed(1)) : 0;
  const weightStatus = weightDiff > 0 ? "✅ Ganhou peso" : weightDiff < 0 ? "⚠️ Perdeu peso" : "➡️ Peso estável";
  return {
    weightStatus,
    weightTrend: `${weightStatus.split(" ")[0]} ${formatWeightGain(weightDiff)}`,
    heightTrend: `${heightDiff > 0 ? "+" : ""}${heightDiff} cm`
  };
}

function growthRecords(baby = activeBaby()) {
  return baby.records.filter((record) => record.type === "growth").sort(sortByDateDesc);
}

function growthEvolution(record, previous) {
  if (!previous) return { weight: "➡️ Peso inicial · 0 g", height: "+0 cm", head: "+0 cm" };
  const weightDiff = Math.round((Number(record.weight || 0) - Number(previous.weight || 0)) * 1000);
  const heightDiff = Number((Number(record.height || 0) - Number(previous.height || 0)).toFixed(1));
  const headDiff = Number((Number(record.head || 0) - Number(previous.head || 0)).toFixed(1));
  const status = weightDiff > 0 ? "✅ Ganhou peso" : weightDiff < 0 ? "⚠️ Perdeu peso" : "➡️ Peso estável";
  return {
    weight: `${status} · ${formatWeightGain(weightDiff)}`,
    height: `${heightDiff > 0 ? "+" : ""}${heightDiff} cm`,
    head: `${headDiff > 0 ? "+" : ""}${headDiff} cm`
  };
}

function formatWeightGain(grams) {
  const prefix = grams > 0 ? "+" : grams < 0 ? "-" : "";
  const abs = Math.abs(grams);
  if (abs >= 1000) {
    const kg = Math.floor(abs / 1000);
    const rest = String(abs % 1000).padStart(3, "0");
    return `${prefix}${kg},${rest} kg`;
  }
  return `${prefix}${abs} g`;
}

function renderGrowthView(baby) {
  const records = growthRecords(baby);
  const chronological = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  $("#growthTable").innerHTML = records.length ? records.map((record) => {
    const index = chronological.findIndex((item) => item.id === record.id);
    const evolution = growthEvolution(record, chronological[index - 1]);
    return `
      <tr>
        <td>${esc(formatOnlyDate(record.date))}</td>
        <td>${esc(record.weight || "--")} kg</td>
        <td>${esc(record.height || "--")} cm</td>
        <td>${esc(record.head || "--")} cm</td>
        <td><strong>${esc(evolution.weight)}</strong><small>Altura: ${esc(evolution.height)} · Perímetro: ${esc(evolution.head)}</small></td>
        <td>
          <button type="button" data-edit-growth="${esc(record.id)}" aria-label="Editar medição">✎</button>
          <button type="button" data-delete-growth="${esc(record.id)}" aria-label="Excluir medição">×</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="6">Nenhuma medição registrada ainda.</td></tr>`;
  renderGrowthCharts(chronological);
}

function renderGrowthCharts(records) {
  const labelFor = (record) => formatOnlyDate(record.date).slice(0, 5);
  renderLineChart("#weightChart", records.map((record) => [labelFor(record), Number(record.weight || 0), "kg"]));
  renderLineChart("#heightChart", records.map((record) => [labelFor(record), Number(record.height || 0), "cm"]));
  renderLineChart("#headChart", records.map((record) => [labelFor(record), Number(record.head || 0), "cm"]));
}

function getFeedSummary(records) {
  const last = records.filter((record) => record.type === "feed").sort(sortByDateDesc)[0];
  if (!last) return { lastTime: "--:--", nextTime: "--:--", countdown: "Sem registro", elapsed: "Sem registro" };
  const lastDate = new Date(last.date || last.createdAt);
  const nextDate = addTime(lastDate, feedIntervalMinutes());
  const now = new Date();
  return {
    lastTime: formatClock(lastDate),
    nextTime: formatClock(nextDate),
    countdown: nextDate > now ? formatDuration(nextDate - now) : "Agora",
    elapsed: formatDuration(now - lastDate)
  };
}

function feedRecords(baby) {
  return baby.records.filter((record) => record.type === "feed").sort(sortByDateDesc);
}

function renderFeedView(baby) {
  const records = feedRecords(baby);
  const summary = getFeedSummary(baby.records);
  const lastBreast = records.find((record) => String(record.feedType || "").includes("Peito"));
  $("#feedLastBreast").textContent = lastBreast ? (lastBreast.feedType || "Peito") : "--";
  $("#feedNextTime").textContent = summary.nextTime;
  $("#feedCountdown").textContent = summary.countdown;
  $("#feedElapsed").textContent = summary.elapsed;
  $("#feedLastInterval").textContent = lastFeedInterval(records);
  $$('input[name="feedInterval"]').forEach((input) => {
    input.checked = Number(input.value) === Number(state.settings.feedIntervalHours || DEFAULT_FEED_INTERVAL_HOURS);
  });
  renderFeedStats(records);
  renderFeedHistory(records);
}

function lastFeedInterval(records) {
  if (records.length < 2) return "--";
  return formatDuration(new Date(records[0].date) - new Date(records[1].date));
}

function renderFeedStats(records) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (record, date) => new Date(record.date).toDateString() === date.toDateString();
  const stats = [
    ["🍼 Mamadas hoje", records.filter((record) => sameDay(record, today)).length],
    ["🍼 Mamadas ontem", records.filter((record) => sameDay(record, yesterday)).length]
  ];

  $("#feedStats").innerHTML = stats.map(([label, value]) => `
    <article class="feed-stat-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
}

function feedIntervals(records) {
  const chronological = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
  const intervals = [];
  chronological.forEach((record, index) => {
    if (index === 0) return;
    intervals.push(new Date(record.date) - new Date(chronological[index - 1].date));
  });
  return intervals.filter((interval) => interval >= 0);
}

function renderFeedHistory(records) {
  if (!records.length) {
    $("#feedHistory").innerHTML = `<div class="empty">Nenhuma mamada registrada ainda.</div>`;
    return;
  }

  const grouped = records.reduce((groups, record, index) => {
    const key = feedDateLabel(record.date);
    groups[key] = groups[key] || [];
    groups[key].push({ record, interval: records[index + 1] ? formatDuration(new Date(record.date) - new Date(records[index + 1].date)) : "--" });
    return groups;
  }, {});

  $("#feedHistory").innerHTML = Object.entries(grouped).map(([label, items]) => `
    <section class="feed-day-group">
      <h4>${esc(label)}</h4>
      ${items.map(({ record, interval }) => `
        <article class="feed-history-item">
          <div>
            <strong>${esc(formatClock(record.date))}</strong>
            <span>${esc(record.feedType || "Tipo não informado")}</span>
            <small>Intervalo: ${esc(interval)}${record.note ? ` · ${esc(record.note)}` : ""}</small>
          </div>
          <div class="feed-history-actions">
            <button type="button" data-edit-feed="${esc(record.id)}" aria-label="Editar mamada">✎</button>
            <button type="button" data-delete-feed="${esc(record.id)}" aria-label="Excluir mamada">×</button>
          </div>
        </article>
      `).join("")}
    </section>
  `).join("");
}

function feedDateLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return formatOnlyDate(date);
}

function getMilkSummary(records) {
  const last = records.filter((record) => record.type === "milk").sort(sortByDateDesc)[0];
  if (!last) {
    return {
      lastTime: "--:--",
      amount: "Não informado",
      ambient: "Sem retirada",
      fridge: "Sem retirada",
      freezer: "Sem retirada",
      remaining: "Sem retirada"
    };
  }
  const validity = milkValidity(last);
  const now = new Date();
  const nearest = Object.values(validity).filter((date) => date > now).sort((a, b) => a - b)[0];
  return {
    lastTime: formatClock(last.date),
    amount: `${last.amount || "Quantidade não informada"} · ${last.side || "Lado não informado"}`,
    ambient: `Válido até ${formatFullDateTime(validity.ambient)}`,
    fridge: `Válido até ${formatFullDateTime(validity.fridge)}`,
    freezer: `Válido até ${formatFullDateTime(validity.freezer)}`,
    remaining: nearest ? formatLongRemaining(nearest - now) : "Vencido"
  };
}

function milkRecords(baby) {
  return baby.records.filter((record) => record.type === "milk").sort(sortByDateDesc);
}

function milkValidity(record) {
  return {
    ambient: addTime(record.date, 4 * 60),
    fridge: addTime(record.date, 4 * 24 * 60),
    freezer: addMonths(record.date, 6)
  };
}

function renderMilkView(baby) {
  const records = milkRecords(baby);
  renderMilkValidityCards(records[0]);
  renderMilkStats(records);
  renderMilkHistory(records);
}

function renderMilkValidityCards(record) {
  const cards = record ? [
    ["🏠 Ambiente", milkValidity(record).ambient, "Até 4 horas"],
    ["❄️ Geladeira", milkValidity(record).fridge, "Até 4 dias"],
    ["🧊 Congelador", milkValidity(record).freezer, "Até 6 meses"]
  ] : [];

  $("#milkValidityCards").innerHTML = record ? cards.map(([title, date, rule]) => `
    <article class="milk-validity-card">
      <small>${esc(rule)}</small>
      <h3>${esc(title)}</h3>
      <p>Retirada: <strong>${esc(formatFullDateTime(record.date))}</strong></p>
      <p>Lado: <strong>${esc(record.side || "Não informado")}</strong></p>
      <p>Válido até: <strong>${esc(formatFullDateTime(date))}</strong></p>
      <p>Faltam: <strong>${esc(formatLongRemaining(date - new Date()))}</strong></p>
    </article>
  `).join("") : `<article class="milk-validity-card"><h3>🤱 Nenhuma retirada</h3><p>Registre uma retirada para acompanhar a validade automaticamente.</p></article>`;
}

function renderMilkStats(records) {
  const now = new Date();
  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - now.getDay());
  startWeek.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = records.filter((record) => new Date(record.date).toDateString() === now.toDateString());
  const week = records.filter((record) => new Date(record.date) >= startWeek);
  const month = records.filter((record) => new Date(record.date) >= startMonth);
  const days = new Set(records.map((record) => new Date(record.date).toDateString()));
  const totalMl = (list) => list.reduce((sum, record) => sum + parseMl(record.amount), 0);
  const dailyAverage = days.size ? Math.round(totalMl(records) / days.size) : 0;
  const stats = [
    ["🤱 Retiradas hoje", today.length],
    ["🍼 Total hoje", `${totalMl(today)} ml`],
    ["📅 Total semana", `${totalMl(week)} ml`],
    ["📆 Total mês", `${totalMl(month)} ml`],
    ["📊 Média diária", `${dailyAverage} ml`]
  ];

  $("#milkStats").innerHTML = stats.map(([label, value]) => `
    <article class="feed-stat-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
}

function renderMilkRelation(baby, latestMilk) {
  const feeds = feedRecords(baby);
  const previousFeed = latestMilk ? feeds.find((feed) => new Date(feed.date) <= new Date(latestMilk.date)) : null;
  const nextFeed = latestMilk ? feeds.filter((feed) => new Date(feed.date) > new Date(latestMilk.date)).sort((a, b) => new Date(a.date) - new Date(b.date))[0] : null;
  const items = [
    ["Última mamada", previousFeed ? formatClock(previousFeed.date) : "--:--"],
    ["Retirada", latestMilk ? formatClock(latestMilk.date) : "--:--"],
    ["Intervalo", previousFeed && latestMilk ? formatDuration(new Date(latestMilk.date) - new Date(previousFeed.date)) : "--"],
    ["Mamada seguinte", nextFeed ? formatClock(nextFeed.date) : "--:--"],
    ["Entre mamadas", previousFeed && nextFeed ? formatDuration(new Date(nextFeed.date) - new Date(previousFeed.date)) : "--"],
    ["Relação", previousFeed && latestMilk ? "Extração após alimentação" : "Aguardando registros"]
  ];

  $("#milkRelation").innerHTML = items.map(([label, value]) => `
    <div>
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </div>
  `).join("");
}

function renderMilkHistory(records) {
  if (!records.length) {
    $("#milkHistory").innerHTML = `<div class="empty">Nenhuma retirada registrada ainda.</div>`;
    return;
  }

  const grouped = records.reduce((groups, record) => {
    const key = feedDateLabel(record.date);
    groups[key] = groups[key] || [];
    groups[key].push(record);
    return groups;
  }, {});

  $("#milkHistory").innerHTML = Object.entries(grouped).map(([label, items]) => `
    <section class="feed-day-group">
      <h4>${esc(label)}</h4>
      ${items.map((record) => {
        const validity = milkValidity(record);
        return `
          <article class="feed-history-item milk-history-item">
            <div>
              <strong>${esc(formatClock(record.date))}${record.amount ? ` — ${esc(record.amount)}` : ""}</strong>
              <span>Lado: ${esc(record.side || "Não informado")}</span>
              <span>Ambiente: ${esc(formatFullDateTime(validity.ambient))} · ${esc(formatLongRemaining(validity.ambient - new Date()))}</span>
              <small>Geladeira: ${esc(formatFullDateTime(validity.fridge))} · Congelador: ${esc(formatFullDateTime(validity.freezer))}${record.note ? ` · ${esc(record.note)}` : ""}</small>
            </div>
            <div class="feed-history-actions">
              <button type="button" data-edit-milk="${esc(record.id)}" aria-label="Editar retirada">✎</button>
              <button type="button" data-delete-milk="${esc(record.id)}" aria-label="Excluir retirada">×</button>
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `).join("");
}

function eliminationRecords(kind, baby = activeBaby()) {
  const config = eliminationConfig[kind];
  return baby.records
    .filter((record) => record.type === "diaper" && record.diaperType?.includes(config.type))
    .sort(sortByDateDesc);
}

function registerElimination(kind, count) {
  const config = eliminationConfig[kind];
  const useOtherDate = $(`#${kind}OtherDate`).checked;
  const selectedDate = useOtherDate ? $(`#${kind}Date`).value : todayInput();
  addRecord("diaper", {
    diaperType: config.type,
    count,
    note: "",
    date: `${selectedDate || todayInput()}T12:00`
  });
  hideEliminationPicker(kind);
  showEliminationFeedback(kind, config.feedback);
}

function openEliminationPicker(kind) {
  const config = eliminationConfig[kind];
  const picker = $(`#${kind}Picker`);
  picker.innerHTML = `
    <p>${esc(config.question)}</p>
    <div class="count-picker">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => `
        <button type="button" data-save-elimination="${esc(kind)}" data-count="${count}">${count === 10 ? "10+" : count}</button>
      `).join("")}
    </div>
  `;
  picker.classList.remove("hidden");
  picker.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideEliminationPicker(kind) {
  $(`#${kind}Picker`).classList.add("hidden");
}

function showEliminationFeedback(kind, message) {
  const feedback = $(`#${kind}Feedback`);
  feedback.textContent = message;
  feedback.classList.add("show");
  window.clearTimeout(feedback.timer);
  feedback.timer = window.setTimeout(() => feedback.classList.remove("show"), 2400);
}

function renderEliminationView(kind, baby) {
  const config = eliminationConfig[kind];
  const records = eliminationRecords(kind, baby);
  const totals = eliminationTotalsByDate(records);
  const todayTotal = totals[todayInput()]?.count || 0;
  const last = records[0];
  $(`#${kind}Summary`).innerHTML = [
    [`${config.icon} ${config.plural[0].toUpperCase()}${config.plural.slice(1)} hoje`, todayTotal],
    ["Última data registrada", last ? formatOnlyDate(last.date) : "Nenhuma"],
    ["Total de dias", Object.keys(totals).length],
    ["Última quantidade", last ? `${recordCount(last)} ${config.plural}` : "--"]
  ].map(([label, value]) => `
    <article class="feed-summary-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
  renderEliminationStats(kind, records, totals);
  renderEliminationHistory(kind, totals);
  renderEliminationCalendar(kind, totals);
  renderEliminationCharts(kind, totals);
  fillEliminationEditOptions(kind);
}

function eliminationTotalsByDate(records) {
  return records.reduce((groups, record) => {
    const key = dateOnly(record.date);
    groups[key] = groups[key] || { count: 0, records: [] };
    groups[key].count += recordCount(record);
    groups[key].records.push(record);
    return groups;
  }, {});
}

function renderEliminationStats(kind, records, totals) {
  const now = new Date();
  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - now.getDay());
  startWeek.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const entries = Object.entries(totals);
  const sumFrom = (start) => entries
    .filter(([date]) => new Date(`${date}T00:00`) >= start)
    .reduce((sum, [, value]) => sum + value.count, 0);
  const today = totals[todayInput()]?.count || 0;
  const total = entries.reduce((sum, [, value]) => sum + value.count, 0);
  const average = entries.length ? (total / entries.length).toFixed(1).replace(".0", "") : "0";
  const max = entries.length ? Math.max(...entries.map(([, value]) => value.count)) : 0;
  const config = eliminationConfig[kind];
  const stats = [
    ["Quantidade hoje", today],
    ["Quantidade esta semana", sumFrom(startWeek)],
    ["Quantidade este mês", sumFrom(startMonth)],
    ["Média diária", average],
    ["Maior quantidade em um dia", `${max} ${config.plural}`]
  ];
  $(`#${kind}Stats`).innerHTML = stats.map(([label, value]) => `
    <article class="feed-stat-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
}

function renderEliminationHistory(kind, totals) {
  const config = eliminationConfig[kind];
  const entries = Object.entries(totals).sort(([a], [b]) => new Date(b) - new Date(a));
  $(`#${kind}History`).innerHTML = entries.length ? entries.map(([date, value]) => `
    <section class="feed-day-group">
      <h4>${esc(feedDateLabel(`${date}T12:00`))}</h4>
      <article class="feed-history-item">
        <div>
          <strong>${esc(value.count)} ${esc(config.plural)}</strong>
          <span>${esc(formatOnlyDate(`${date}T12:00`))}</span>
          <small>${esc(value.records.map((record) => record.note).filter(Boolean).join(" · ") || "Sem observações")}</small>
        </div>
        <div class="feed-history-actions">
          <button type="button" data-show-elimination-day="${esc(kind)}" data-date="${esc(date)}" aria-label="Ver detalhes">☰</button>
          <button type="button" data-edit-elimination="${esc(kind)}" data-id="${esc(value.records[0].id)}" aria-label="Editar registro">✎</button>
          <button type="button" data-delete-elimination="${esc(kind)}" data-id="${esc(value.records[0].id)}" aria-label="Excluir registro">×</button>
        </div>
      </article>
    </section>
  `).join("") : `<div class="empty">Nenhum registro por enquanto.</div>`;
}

function renderEliminationCalendar(kind, totals) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const blanks = firstDay.getDay();
  const cells = [];
  for (let index = 0; index < blanks; index += 1) cells.push(`<span></span>`);
  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const total = totals[date]?.count || 0;
    cells.push(`<button type="button" class="${total ? "has-record" : ""}" data-calendar-day="${esc(kind)}" data-date="${date}"><strong>${day}</strong><small>${total || ""}</small></button>`);
  }
  $(`#${kind}Calendar`).innerHTML = `
    <div class="calendar-weekdays"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="calendar-days">${cells.join("")}</div>
  `;
}

function renderEliminationCharts(kind, totals) {
  const config = eliminationConfig[kind];
  const now = new Date();
  const weekItems = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    const key = dateOnly(date);
    return [new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date), totals[key]?.count || 0];
  });
  const monthItems = Object.entries(totals)
    .filter(([date]) => new Date(`${date}T12:00`).getMonth() === now.getMonth())
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([date, value]) => [new Date(`${date}T12:00`).getDate(), value.count]);
  renderBarChart(`#${kind}WeeklyChart`, weekItems, config.plural);
  renderBarChart(`#${kind}MonthlyChart`, monthItems.length ? monthItems : [["--", 0]], config.plural);
}

function renderBarChart(selector, items, label) {
  const max = Math.max(1, ...items.map(([, value]) => value));
  $(selector).innerHTML = items.map(([name, value]) => `
    <div class="bar-row">
      <span>${esc(name)}</span>
      <div><i style="width:${Math.max(6, (value / max) * 100)}%"></i></div>
      <strong>${esc(value)}</strong>
    </div>
  `).join("");
}

function renderLineChart(selector, items) {
  const target = $(selector);
  if (!items.length) {
    target.innerHTML = `<div class="empty">Sem dados suficientes.</div>`;
    return;
  }
  const width = 320;
  const height = 150;
  const values = items.map(([, value]) => value).filter((value) => Number.isFinite(value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const points = items.map(([label, value], index) => {
    const x = items.length === 1 ? width / 2 : 24 + (index * (width - 48)) / (items.length - 1);
    const y = height - 26 - ((value - min) / range) * (height - 54);
    return { label, value, x, y };
  });
  target.innerHTML = `
    <svg class="growth-line-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de crescimento">
      <line x1="24" y1="${height - 26}" x2="${width - 18}" y2="${height - 26}" />
      <line x1="24" y1="18" x2="24" y2="${height - 26}" />
      <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" />
      ${points.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4" />
        <text x="${point.x}" y="${Math.max(14, point.y - 9)}">${esc(point.value)}</text>
        <text x="${point.x}" y="${height - 8}">${esc(point.label)}</text>
      `).join("")}
    </svg>
  `;
}

function fillEliminationEditOptions(kind) {
  const select = $(`#${kind}EditForm select[name="count"]`);
  if (!select || select.options.length) return;
  select.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => `<option value="${count}">${count === 10 ? "10+" : count}</option>`).join("");
}

function openEliminationEdit(kind, id) {
  const record = findRecord(id);
  if (!record) return;
  fillEliminationEditOptions(kind);
  const form = $(`#${kind}EditForm`);
  form.elements.id.value = record.id;
  form.elements.date.value = dateOnly(record.date);
  form.elements.count.value = String(Math.min(10, recordCount(record)));
  form.elements.note.value = record.note || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeEliminationEdit(kind) {
  const form = $(`#${kind}EditForm`);
  form.classList.add("hidden");
  form.reset();
}

function showEliminationDay(kind, date) {
  const totals = eliminationTotalsByDate(eliminationRecords(kind));
  const config = eliminationConfig[kind];
  const item = totals[date];
  $(`#${kind}CalendarDetail`).textContent = item
    ? `${formatOnlyDate(`${date}T12:00`)}: ${item.count} ${config.plural}. ${item.records.map((record) => record.note).filter(Boolean).join(" · ") || "Sem observações."}`
    : `${formatOnlyDate(`${date}T12:00`)}: sem registro.`;
}

function medicineRecords(baby = activeBaby()) {
  return baby.records.filter((record) => record.type === "medicine").sort(sortByDateDesc);
}

function medicineNextDate(record) {
  if (record.next) return new Date(record.next);
  const interval = Number(record.intervalHours || 0);
  return addTime(record.date, interval * 60) || new Date(record.date || record.createdAt || Date.now());
}

function medicineIntervalLabel(record) {
  const hours = Number(record.intervalHours || 0);
  return hours ? `${hours} em ${hours} horas` : "Sem intervalo";
}

function registerMedicine(data) {
  const intervalHours = data.interval === "custom" ? Number(data.customInterval) : Number(data.interval);
  const date = dateTimeOrNow(data.date, data.time);
  const nextDate = intervalHours ? addTime(date, intervalHours * 60) : null;
  addRecord("medicine", {
    name: data.name.trim() || "Remédio",
    dose: data.dose,
    note: data.note,
    taken: data.taken,
    intervalHours,
    date,
    next: nextDate?.toISOString()
  });
  hideMedicineForm();
  showMedicineFeedback("✅ Remédio registrado com sucesso.");
  requestNotificationPermission();
}

function showMedicineForm() {
  $("#medicineForm").classList.remove("hidden");
  $("#medicineForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideMedicineForm() {
  $("#medicineForm").classList.add("hidden");
}

function showMedicineFeedback(message) {
  const feedback = $("#medicineFeedback");
  feedback.textContent = message;
  feedback.classList.add("show");
  window.clearTimeout(feedback.timer);
  feedback.timer = window.setTimeout(() => feedback.classList.remove("show"), 2400);
}

function renderMedicineView(baby) {
  const records = medicineRecords(baby);
  const next = getNextMedicine(records);
  const now = new Date();
  $("#medicineSummary").innerHTML = [
    ["💊 Próximo remédio", next ? next.name || "Remédio" : "Nenhum"],
    ["🕒 Próxima dose", next ? formatClock(medicineNextDate(next)) : "--:--"],
    ["⌛ Faltam", next ? (medicineNextDate(next) > now ? formatDuration(medicineNextDate(next) - now) : "Agora") : "Sem registro"],
    ["Intervalo", next ? medicineIntervalLabel(next) : "--"]
  ].map(([label, value]) => `
    <article class="feed-summary-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
  renderMedicineStats(records);
  renderMedicineHistory(records);
}

function getNextMedicine(records) {
  const now = new Date();
  const future = records
    .filter((record) => medicineNextDate(record) >= now)
    .sort((a, b) => medicineNextDate(a) - medicineNextDate(b))[0];
  return future || records.sort((a, b) => medicineNextDate(b) - medicineNextDate(a))[0];
}

function renderMedicineStats(records) {
  const now = new Date();
  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - now.getDay());
  startWeek.setHours(0, 0, 0, 0);
  const today = records.filter((record) => new Date(record.date).toDateString() === now.toDateString()).length;
  const usage = records.reduce((map, record) => {
    const name = record.name || "Remédio";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {});
  const mostUsed = Object.entries(usage).sort((a, b) => b[1] - a[1])[0];
  const stats = [
    ["💊 Doses hoje", today],
    ["✅ Tomadas", records.filter((record) => record.taken === "yes").length],
    ["❌ Não tomadas", records.filter((record) => record.taken === "no").length],
    ["📊 Mais utilizado", mostUsed ? `${mostUsed[0]} (${mostUsed[1]})` : "--"]
  ];
  $("#medicineStats").innerHTML = stats.map(([label, value]) => `
    <article class="feed-stat-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
}

function renderMedicineHistory(records) {
  if (!records.length) {
    $("#medicineHistory").innerHTML = `<div class="empty">Nenhum remédio registrado ainda.</div>`;
    return;
  }
  const grouped = records.reduce((groups, record) => {
    const key = feedDateLabel(record.date);
    groups[key] = groups[key] || [];
    groups[key].push(record);
    return groups;
  }, {});
  $("#medicineHistory").innerHTML = Object.entries(grouped).map(([label, items]) => `
    <section class="feed-day-group">
      <h4>${esc(label)}</h4>
      ${items.map((record) => `
        <article class="feed-history-item">
          <div>
            <strong>${esc(record.name || "Remédio")}</strong>
            <span>${esc(formatClock(record.date))} · ${esc(record.dose || "Quantidade não informada")}</span>
            <small>${esc(record.taken === "yes" ? "Tomou: Sim" : record.taken === "no" ? "Tomou: Não" : "Tomou: não informado")} · Intervalo: ${esc(medicineIntervalLabel(record))} · Próxima dose: ${esc(formatFullDateTime(medicineNextDate(record)))}${record.note ? ` · ${esc(record.note)}` : ""}</small>
          </div>
          <div class="feed-history-actions">
            <button type="button" data-edit-medicine="${esc(record.id)}" aria-label="Editar remédio">✎</button>
            <button type="button" data-delete-medicine="${esc(record.id)}" aria-label="Excluir remédio">×</button>
          </div>
        </article>
      `).join("")}
    </section>
  `).join("");
}

function openMedicineEdit(id) {
  const record = findRecord(id);
  if (!record) return;
  const date = new Date(record.date);
  const form = $("#medicineEditForm");
  form.elements.id.value = record.id;
  form.elements.name.value = record.name || "";
  form.elements.dose.value = record.dose || "";
  form.elements.date.value = dateOnly(record.date);
  form.elements.time.value = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  form.elements.intervalHours.value = record.intervalHours || 6;
  form.elements.taken.value = record.taken || "";
  form.elements.note.value = record.note || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeMedicineEdit() {
  $("#medicineEditForm").classList.add("hidden");
  $("#medicineEditForm").reset();
}

function appointmentRecords(baby = activeBaby()) {
  return baby.records.filter((record) => record.type === "appointment").sort(sortByDateDesc);
}

function upcomingAppointments(records) {
  const now = new Date();
  return records.filter((record) => new Date(record.date) >= now).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function registerAppointment(data) {
  const doctor = data.doctor === "Outro" ? data.otherDoctor : data.doctor;
  addRecord("appointment", {
    doctor: (doctor || "Consulta").trim(),
    place: data.place,
    phone: data.phone,
    note: data.note,
    date: dateTimeOrNow(data.date, data.time)
  });
  hideAppointmentForm();
  showAppointmentFeedback("✅ Consulta registrada com sucesso.");
  requestNotificationPermission();
}

function showAppointmentForm() {
  $("#appointmentForm").classList.remove("hidden");
  $("#appointmentForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideAppointmentForm() {
  $("#appointmentForm").classList.add("hidden");
}

function showAppointmentFeedback(message) {
  const feedback = $("#appointmentFeedback");
  feedback.textContent = message;
  feedback.classList.add("show");
  window.clearTimeout(feedback.timer);
  feedback.timer = window.setTimeout(() => feedback.classList.remove("show"), 2400);
}

function renderAppointmentView(baby) {
  const records = appointmentRecords(baby);
  const next = upcomingAppointments(records)[0];
  $("#appointmentSummary").innerHTML = [
    ["🩺 Próxima consulta", next ? next.doctor || "Consulta" : "Nenhuma"],
    ["📅 Data", next ? formatOnlyDate(next.date) : "--/--/----"],
    ["🕒 Horário", next ? formatClock(next.date) : "--:--"],
    ["📍 Local", next ? next.place || "Local não informado" : "--"]
  ].map(([label, value]) => `
    <article class="feed-summary-card">
      <small>${esc(label)}</small>
      <strong>${esc(value)}</strong>
    </article>
  `).join("");
  renderAppointmentCalendar(records);
  renderAppointmentHistory(records);
}

function appointmentTotalsByDate(records) {
  return records.reduce((groups, record) => {
    const key = dateOnly(record.date);
    groups[key] = groups[key] || [];
    groups[key].push(record);
    return groups;
  }, {});
}

function renderAppointmentCalendar(records) {
  const now = new Date();
  const totals = appointmentTotalsByDate(records);
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < firstDay.getDay(); index += 1) cells.push(`<span></span>`);
  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = totals[date]?.length || 0;
    cells.push(`<button type="button" class="${count ? "has-record" : ""}" data-appointment-day="${esc(date)}"><strong>${day}</strong><small>${count || ""}</small></button>`);
  }
  $("#appointmentCalendar").innerHTML = `
    <div class="calendar-weekdays"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="calendar-days">${cells.join("")}</div>
  `;
}

function showAppointmentDay(date) {
  const records = appointmentTotalsByDate(appointmentRecords())[date] || [];
  $("#appointmentCalendarDetail").innerHTML = records.length ? `
    <strong>${esc(formatOnlyDate(`${date}T12:00`))}</strong>
    ${records.map((record) => `
      <div class="day-detail-row">
        <span>${esc(record.doctor || "Consulta")} · ${esc(formatClock(record.date))} · ${esc(record.place || "Local não informado")}</span>
        <button type="button" data-edit-appointment="${esc(record.id)}">Editar</button>
      </div>
    `).join("")}
  ` : `${formatOnlyDate(`${date}T12:00`)}: sem consulta.`;
}

function renderAppointmentHistory(records) {
  if (!records.length) {
    $("#appointmentHistory").innerHTML = `<div class="empty">Nenhuma consulta registrada ainda.</div>`;
    return;
  }
  const grouped = records.reduce((groups, record) => {
    const key = feedDateLabel(record.date);
    groups[key] = groups[key] || [];
    groups[key].push(record);
    return groups;
  }, {});
  $("#appointmentHistory").innerHTML = Object.entries(grouped).map(([label, items]) => `
    <section class="feed-day-group">
      <h4>${esc(label)}</h4>
      ${items.map((record) => `
        <article class="feed-history-item">
          <div>
            <strong>${esc(record.doctor || "Consulta")}</strong>
            <span>${esc(formatOnlyDate(record.date))} · ${esc(formatClock(record.date))}</span>
            <small>${esc(record.place || "Local não informado")}${record.phone ? ` · ${esc(record.phone)}` : ""}${record.note ? ` · ${esc(record.note)}` : ""}</small>
          </div>
          <div class="feed-history-actions">
            <button type="button" data-calendar-appointment="${esc(record.id)}" aria-label="Adicionar ao calendário">📅</button>
            <button type="button" data-duplicate-appointment="${esc(record.id)}" aria-label="Duplicar consulta">⧉</button>
            <button type="button" data-edit-appointment="${esc(record.id)}" aria-label="Editar consulta">✎</button>
            <button type="button" data-delete-appointment="${esc(record.id)}" aria-label="Excluir consulta">×</button>
          </div>
        </article>
      `).join("")}
    </section>
  `).join("");
}

function openAppointmentEdit(id) {
  const record = findRecord(id);
  if (!record) return;
  const date = new Date(record.date);
  const form = $("#appointmentEditForm");
  form.elements.id.value = record.id;
  form.elements.doctor.value = record.doctor || "";
  form.elements.date.value = dateOnly(record.date);
  form.elements.time.value = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  form.elements.place.value = record.place || "";
  form.elements.phone.value = record.phone || "";
  form.elements.note.value = record.note || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeAppointmentEdit() {
  $("#appointmentEditForm").classList.add("hidden");
  $("#appointmentEditForm").reset();
}

function openGrowthEdit(id) {
  const record = findRecord(id);
  if (!record) return;
  const form = $("#growthEditForm");
  form.elements.id.value = record.id;
  form.elements.date.value = dateOnly(record.date);
  form.elements.weight.value = record.weight || "";
  form.elements.height.value = record.height || "";
  form.elements.head.value = record.head || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeGrowthEdit() {
  $("#growthEditForm").classList.add("hidden");
  $("#growthEditForm").reset();
}

function duplicateAppointment(id) {
  const record = findRecord(id);
  if (!record) return;
  addRecord("appointment", {
    doctor: record.doctor,
    place: record.place,
    phone: record.phone,
    note: record.note,
    date: record.date
  });
  showAppointmentFeedback("✅ Consulta duplicada.");
}

function downloadAppointmentCalendar(id) {
  const record = findRecord(id);
  if (!record) return;
  const start = new Date(record.date);
  const end = new Date(start.getTime() + 45 * 60000);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meu Bebe//Consultas//PT",
    "BEGIN:VEVENT",
    `UID:${record.id}@meu-bebe`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${record.doctor || "Consulta do bebê"}`,
    `LOCATION:${record.place || ""}`,
    `DESCRIPTION:${record.note || ""}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `consulta-${dateOnly(record.date)}.ics`;
  link.click();
  URL.revokeObjectURL(url);
  showAppointmentFeedback("📅 Arquivo de calendário criado.");
}

function getDiaperSummary(records) {
  const diapers = records.filter((record) => record.type === "diaper");
  const today = todayRecords(diapers);
  const poopRecords = diapers.filter((record) => record.diaperType?.includes("Cocô"));
  const peeRecords = diapers.filter((record) => record.diaperType?.includes("Xixi"));
  return {
    poopCount: today.filter((record) => record.diaperType?.includes("Cocô")).reduce((sum, record) => sum + recordCount(record), 0),
    peeCount: today.filter((record) => record.diaperType?.includes("Xixi")).reduce((sum, record) => sum + recordCount(record), 0),
    lastPoop: poopRecords.sort(sortByDateDesc)[0] ? formatDate(poopRecords.sort(sortByDateDesc)[0].date) : "Nenhum",
    lastPee: peeRecords.sort(sortByDateDesc)[0] ? formatDate(peeRecords.sort(sortByDateDesc)[0].date) : "Nenhum"
  };
}

function getMedicineSummary(records) {
  const next = getNextMedicine(records.filter((record) => record.type === "medicine"));
  if (!next) return { name: "Nenhum agendado", time: "--:--", countdown: "Sem registro" };
  const date = medicineNextDate(next);
  return { name: next.name || "Remédio", time: formatClock(date), countdown: date > new Date() ? formatDuration(date - new Date()) : "Agora" };
}

function getAppointmentSummary(records) {
  const next = upcomingAppointments(records.filter((record) => record.type === "appointment"))[0];
  if (!next) return { doctor: "Nenhuma consulta", date: "--/--/----", time: "--:--" };
  return { doctor: next.doctor || "Consulta", date: formatOnlyDate(next.date), time: formatClock(next.date) };
}

function sortByDateDesc(a, b) {
  return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
}

function renderTimeline(baby) {
  const filter = $("#historyFilter").value;
  const records = baby.records
    .filter((record) => filter === "all" || record.type === filter)
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

  $("#timeline").innerHTML = records.length ? records.map((record) => `
    <article class="timeline-item">
      <header>
        <strong>${esc(typeMeta[record.type]?.icon || "•")} ${esc(timelineTitle(record))}</strong>
        <button type="button" aria-label="Remover registro" data-remove="${record.id}">×</button>
      </header>
      <small>${esc(formatDate(record.date || record.createdAt))}</small>
      <p>${esc(timelineDetail(record))}</p>
    </article>
  `).join("") : `<div class="empty">Nenhum registro por enquanto.</div>`;
}

function timelineTitle(record) {
  if (record.type === "medicine") return record.name || "Remédio";
  if (record.type === "appointment") return record.doctor || "Consulta";
  return typeMeta[record.type]?.label || "Registro";
}

function timelineDetail(record) {
  const details = {
    feed: [record.feedType, record.amount],
    milk: [record.amount, record.place, record.expires ? `validade ${formatDate(record.expires)}` : ""],
    diaper: [record.diaperType, record.note],
    medicine: [record.dose, record.next ? `próximo ${formatDate(record.next)}` : ""],
    appointment: [record.place],
    growth: [`${record.weight || "--"} kg`, `${record.height || "--"} cm`, `${record.head || "--"} cm perímetro`],
    pee: ["Xixi registrado rapidamente"],
    poop: ["Cocô registrado rapidamente"],
    sleep: ["Sono registrado rapidamente"]
  };
  return (details[record.type] || []).filter(Boolean).join(" · ") || "Sem observações";
}

function renderProfiles() {
  $("#babyProfiles").innerHTML = state.babies.map((baby) => `
    <div class="profile-item">
      <div>
        <strong>${esc(baby.name)}</strong>
        <small>${esc(baby.id === state.activeBabyId ? "Perfil ativo" : ageText(baby.birthDate))}</small>
      </div>
      <div class="profile-actions">
        <button type="button" data-baby="${esc(baby.id)}" aria-label="Trocar para ${esc(baby.name)}">${baby.id === state.activeBabyId ? "✓" : "🔄"}</button>
        <button type="button" data-edit-baby="${esc(baby.id)}" aria-label="Editar ${esc(baby.name)}">✏️</button>
        <button type="button" data-delete-baby="${esc(baby.id)}" aria-label="Excluir ${esc(baby.name)}">🗑️</button>
      </div>
    </div>
  `).join("");
}

function getAlerts(baby) {
  if (!state.settings.visualAlerts) return [];
  const now = Date.now();
  const soon = now + 6 * 60 * 60 * 1000;
  const regularAlerts = baby.records
    .flatMap((record) => {
      const checks = [];
      if (record.type === "medicine") checks.push(["Remédio", medicineNextDate(record)]);
      if (record.type === "appointment" && record.date) checks.push(["Consulta", record.date]);
      return checks.map(([title, date]) => ({ title, date: new Date(date), record }));
    })
    .filter((item) => !Number.isNaN(item.date.getTime()) && item.date.getTime() <= soon)
    .sort((a, b) => a.date - b.date)
    .map((item) => ({
      title: item.title,
      text: item.date.getTime() < now ? `${item.title} vencido em ${formatDate(item.date)}` : `${item.title} próximo: ${formatDate(item.date)}`,
      danger: item.date.getTime() < now
    }));
  const milkAlerts = milkRecords(baby).flatMap((record) => {
    const validity = milkValidity(record);
    return [
      ["Leite ambiente", validity.ambient, 30 * 60000],
      ["Leite na geladeira", validity.fridge, 24 * 60 * 60000],
      ["Leite no congelador", validity.freezer, 7 * 24 * 60 * 60000]
    ].filter(([, date, windowMs]) => date.getTime() <= now + windowMs)
      .map(([title, date]) => ({
        title,
        text: date.getTime() < now ? `${title} vencido em ${formatFullDateTime(date)}` : `${title} vence em ${formatLongRemaining(date - now)}`,
        danger: date.getTime() < now
      }));
  });
  return [...regularAlerts, ...milkAlerts];
}

function scheduleNotifications(baby) {
  scheduleFeedNotifications(baby);
  scheduleMilkNotifications(baby);
  scheduleMedicineNotifications(baby);
  scheduleAppointmentNotifications(baby);
}

function scheduleFeedNotifications(baby) {
  feedNotificationTimers.forEach((timer) => window.clearTimeout(timer));
  feedNotificationTimers = [];
  const last = feedRecords(baby)[0];
  if (!last) return;
  const nextDate = addTime(last.date, feedIntervalMinutes());
  if (!nextDate) return;
  [
    [nextDate.getTime() - Date.now() - 15 * 60000, "🍼 Está chegando a hora da próxima mamada."],
    [nextDate.getTime() - Date.now(), "🍼 Hora da próxima mamada."]
  ].forEach(([delay, message]) => {
    if (delay <= 0 || delay > 2147483647) return;
    feedNotificationTimers.push(window.setTimeout(() => {
      toast(message);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Meu Bebê", { body: message, icon: "assets/baby-clouds.png" });
      }
    }, delay));
  });
}

function scheduleMilkNotifications(baby) {
  milkNotificationTimers.forEach((timer) => window.clearTimeout(timer));
  milkNotificationTimers = [];
  milkRecords(baby).forEach((record) => {
    const validity = milkValidity(record);
    [
      [validity.ambient.getTime() - Date.now() - 30 * 60000, "⚠️ O leite armazenado em temperatura ambiente vence em 30 minutos."],
      [validity.fridge.getTime() - Date.now() - 24 * 60 * 60000, "⚠️ O leite armazenado na geladeira vence amanhã."],
      [validity.freezer.getTime() - Date.now() - 7 * 24 * 60 * 60000, "⚠️ O leite armazenado no congelador vence em 7 dias."]
    ].forEach(([delay, message]) => {
      if (delay <= 0 || delay > 2147483647) return;
      milkNotificationTimers.push(window.setTimeout(() => {
        toast(message);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Meu Bebê", { body: message, icon: "assets/baby-clouds.png" });
        }
      }, delay));
    });
  });
}

function scheduleMedicineNotifications(baby) {
  medicineNotificationTimers.forEach((timer) => window.clearTimeout(timer));
  medicineNotificationTimers = [];
  medicineRecords(baby).forEach((record) => {
    const nextDate = medicineNextDate(record);
    [
      [nextDate.getTime() - Date.now() - 60 * 60000, `💊 ${record.name || "Remédio"} em 1 hora.`, false],
      [nextDate.getTime() - Date.now() - 30 * 60000, `💊 ${record.name || "Remédio"} em 30 minutos.`, false],
      [nextDate.getTime() - Date.now() - 15 * 60000, `💊 ${record.name || "Remédio"} em 15 minutos.`, false],
      [nextDate.getTime() - Date.now(), `O bebê tomou ${record.name || "este remédio"}?`, true]
    ].forEach(([delay, message, shouldAsk]) => {
      if (delay <= 0 || delay > 2147483647) return;
      medicineNotificationTimers.push(window.setTimeout(() => {
        if (shouldAsk) {
          const taken = window.confirm(`${message}\n\nOK = Sim, tomou\nCancelar = Não tomou`);
          updateRecord(record.id, { taken: taken ? "yes" : "no" });
          toast(taken ? "✅ Dose marcada como tomada." : "⚠️ Dose marcada como não tomada.");
          return;
        }
        toast(message);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Meu Bebê", { body: message, icon: "assets/baby-clouds.png" });
        }
      }, delay));
    });
  });
}

function scheduleAppointmentNotifications(baby) {
  appointmentNotificationTimers.forEach((timer) => window.clearTimeout(timer));
  appointmentNotificationTimers = [];
  appointmentRecords(baby).forEach((record) => {
    const date = new Date(record.date);
    [
      [date.getTime() - Date.now() - 7 * 24 * 60 * 60000, `📅 Consulta em 7 dias: ${record.doctor || "Consulta"}.`],
      [date.getTime() - Date.now() - 24 * 60 * 60000, `📅 Consulta amanhã: ${record.doctor || "Consulta"}.`],
      [date.getTime() - Date.now() - 2 * 60 * 60000, `🕑 Consulta em 2 horas: ${record.doctor || "Consulta"}.`],
      [date.getTime() - Date.now() - 30 * 60000, `🕒 Consulta em 30 minutos: ${record.doctor || "Consulta"}.`],
      [date.getTime() - Date.now(), `✅ Hora da consulta: ${record.doctor || "Consulta"}.`]
    ].forEach(([delay, message]) => {
      if (delay <= 0 || delay > 2147483647) return;
      appointmentNotificationTimers.push(window.setTimeout(() => {
        toast(message);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Meu Bebê", { body: message, icon: "assets/baby-clouds.png" });
        }
      }, delay));
    });
  });
}

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => {});
}

function renderAlerts(baby) {
  const alerts = getAlerts(baby);
  $("#alertsList").innerHTML = alerts.length ? alerts.map((alert) => `
    <div class="alert-item ${alert.danger ? "danger" : "soon"}">
      <strong>${esc(alert.title)}</strong>
      <small>${esc(alert.text)}</small>
    </div>
  `).join("") : `<div class="empty">Sem alertas ativos.</div>`;
}

function toast(message) {
  const toastElement = $("#toast");
  toastElement.textContent = message;
  toastElement.classList.add("show");
  window.clearTimeout(toastElement.timer);
  toastElement.timer = window.setTimeout(() => toastElement.classList.remove("show"), 2200);
}

function askConfirm(message) {
  if (typeof window.confirm === "function") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "confirm-backdrop";
    dialog.innerHTML = `
      <article class="confirm-box" role="dialog" aria-modal="true" aria-live="polite">
        <p>${esc(message)}</p>
        <div>
          <button type="button" data-confirm-choice="no">Cancelar</button>
          <button type="button" data-confirm-choice="yes">Excluir</button>
        </div>
      </article>
    `;
    const finish = (value) => {
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-confirm-choice]");
      if (!button && event.target !== dialog) return;
      finish(button?.dataset.confirmChoice === "yes");
    });
    document.body.appendChild(dialog);
    dialog.querySelector("[data-confirm-choice='no']").focus();
  });
}

function switchTab(tab) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === tab));
  const activeTab = tab === "pee" ? "poop" : tab === "appointment" ? "medicine" : tab;
  $$(".tabbar button").forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openForm(targetKey) {
  if (targetKey === "feed") {
    switchTab("feed");
    $("#quickFeedNow")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (targetKey === "milk") {
    switchTab("milk");
    showMilkForm();
    return;
  }
  if (targetKey === "poop" || targetKey === "pee") {
    switchTab(targetKey);
    openEliminationPicker(targetKey);
    return;
  }
  if (targetKey === "medicine") {
    switchTab("medicine");
    showMedicineForm();
    return;
  }
  if (targetKey === "appointment") {
    switchTab("appointment");
    showAppointmentForm();
    return;
  }
  const target = formTargets[targetKey];
  if (!target) return;
  switchTab("register");
  const form = $(`[data-form="${target.form}"]`);
  if (!form) return;
  if (target.diaperType) {
    const select = form.elements.type;
    if (select) select.value = target.diaperType;
  }
  form.classList.add("focus-pulse");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => form.classList.remove("focus-pulse"), 1300);
}

function openHomeTarget(targetKey) {
  if ($(`#view-${targetKey}`)) {
    switchTab(targetKey);
    return;
  }
  if (targetKey === "profile") {
    switchTab("profile");
    return;
  }
  if (targetKey === "notifications") {
    switchTab("tools");
    $("#alertsList")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (targetKey === "milk") {
    switchTab("milk");
    return;
  }
  if (targetKey === "poop" || targetKey === "pee") {
    switchTab(targetKey);
    return;
  }
  if (targetKey === "medicine" || targetKey === "appointment") {
    switchTab(targetKey);
    return;
  }
  openForm(targetKey);
}

function openFeedEdit(id) {
  const record = findRecord(id);
  if (!record) return;
  const form = $("#feedEditForm");
  const date = new Date(record.date);
  form.elements.id.value = record.id;
  form.elements.time.value = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  form.elements.date.value = date.toISOString().slice(0, 10);
  form.elements.feedType.value = record.feedType || "Peito esquerdo";
  form.elements.note.value = record.note || "";
  form.elements.amount.value = parseMl(record.amount) || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeFeedEdit() {
  $("#feedEditForm").classList.add("hidden");
  $("#feedEditForm").reset();
}

function openMilkEdit(id) {
  const record = findRecord(id);
  if (!record) return;
  const form = $("#milkEditForm");
  const date = new Date(record.date);
  form.elements.id.value = record.id;
  form.elements.time.value = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  form.elements.date.value = date.toISOString().slice(0, 10);
  form.elements.amount.value = parseMl(record.amount) || "";
  form.elements.side.value = record.side || "";
  form.elements.note.value = record.note || "";
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeMilkEdit() {
  $("#milkEditForm").classList.add("hidden");
  $("#milkEditForm").reset();
}

function setDefaultDateFields(root = document) {
  $$("input[type='datetime-local']", root).forEach((input) => {
    if (!input.value) input.value = nowLocalInput();
  });
  $$("input[type='date']", root).forEach((input) => {
    if (!input.value) input.value = todayInput();
  });
  $$("input[type='time']", root).forEach((input) => {
    if (!input.value) input.value = nowLocalInput().slice(11, 16);
  });
}

// Eventos ficam separados da renderizacao para facilitar crescimento do projeto.
function setupForms() {
  setDefaultDateFields();

  $$("[data-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const type = form.dataset.form;
      const payloads = {
        feed: { feedType: data.type, amount: data.amount, date: data.date },
        milk: { amount: data.amount, place: data.place, expires: data.expires, date: data.expires },
        diaper: { diaperType: data.type, note: data.note, date: data.date },
        medicine: { name: data.name || "Remédio", dose: data.dose, next: data.next, date: data.next },
        appointment: { doctor: data.doctor || "Consulta", place: data.place, date: data.date },
        growth: { weight: cleanNumber(data.weight), height: cleanNumber(data.height), head: cleanNumber(data.head), date: data.date || todayInput() }
      };
      const payload = payloads[type];
      if (type === "growth") {
        activeBaby().weight = payload.weight || activeBaby().weight;
        activeBaby().height = payload.height || activeBaby().height;
      }
      addRecord(type, payload);
      form.reset();
      setDefaultDateFields(form);
    });
  });

  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const baby = activeBaby();
    baby.name = data.name.trim() || baby.name;
    baby.birthDate = data.birthDate;
    baby.sex = data.sex || "";
    baby.weight = cleanNumber(data.weight);
    baby.height = cleanNumber(data.height);
    saveState();
    toast("Perfil atualizado em todas as telas");
  });

  $("#welcomeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const baby = activeBaby();
    baby.name = data.name.trim() || "Bebê";
    baby.birthDate = data.birthDate || "";
    baby.weight = cleanNumber(data.weight);
    baby.height = cleanNumber(data.height);
    const head = cleanNumber(data.head);
    if (baby.weight || baby.height || head) {
      baby.records.unshift({
        id: crypto.randomUUID(),
        type: "growth",
        createdAt: new Date().toISOString(),
        date: todayInput(),
        weight: baby.weight,
        height: baby.height,
        head
      });
    }
    localStorage.setItem(`${STORAGE_KEY}:welcomed`, "1");
    saveState();
    toast("Bebê cadastrado");
  });
}

function setupEvents() {
  $$(".tabbar button").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("#settingsShortcut").addEventListener("click", () => switchTab("tools"));
  $("#notificationsShortcut").addEventListener("click", () => openHomeTarget("notifications"));
  $("#profileShortcut").addEventListener("click", () => switchTab("profile"));

  $("#view-home").addEventListener("click", (event) => {
    const formButton = event.target.closest("[data-open-form]");
    if (formButton) {
      openForm(formButton.dataset.openForm);
      return;
    }
    const card = event.target.closest("[data-home-card]");
    if (card && !event.target.closest(".baby-photo")) openHomeTarget(card.dataset.homeCard);
  });

  $("#view-home").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-home-card]");
    if (!card) return;
    event.preventDefault();
    openHomeTarget(card.dataset.homeCard);
  });

  $("#quickFeedNow").addEventListener("click", showFeedQuickChoices);
  $("#feedFab").addEventListener("click", showFeedQuickChoices);

  $("#feedQuickChoice").addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-feed]");
    if (!button) return;
    registerQuickFeed(button.dataset.quickFeed);
  });

  $("#feedTypePicker").addEventListener("click", (event) => {
    const button = event.target.closest("[data-feed-type]");
    if (!button || !pendingFeedId) return;
    updateRecord(pendingFeedId, { feedType: button.dataset.feedType });
    pendingFeedId = null;
    hideFeedTypePicker();
    showFeedFeedback("✅ Tipo de mamada salvo.");
  });

  $("#manualFeedOtherDate").addEventListener("change", (event) => {
    $("#manualFeedDateWrap").classList.toggle("hidden", !event.target.checked);
  });

  $("#manualFeedForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const useOtherDate = $("#manualFeedOtherDate").checked;
    registerManualFeed(data.time, useOtherDate ? data.date : todayInput(), data.feedType);
    event.currentTarget.reset();
    $("#manualFeedOtherDate").checked = false;
    $("#manualFeedDateWrap").classList.add("hidden");
    setDefaultDateFields(event.currentTarget);
  });

  $("#feedIntervalOptions").addEventListener("change", (event) => {
    if (event.target.name !== "feedInterval") return;
    state.settings.feedIntervalHours = Number(event.target.value);
    saveState();
    toast("Intervalo de mamadas atualizado");
  });

  $("#feedHistory").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-feed]");
    const deleteButton = event.target.closest("[data-delete-feed]");
    if (editButton) openFeedEdit(editButton.dataset.editFeed);
    if (deleteButton && await askConfirm("Deseja realmente excluir esta mamada?")) {
      removeRecord(deleteButton.dataset.deleteFeed);
      showFeedFeedback("✅ Mamada excluída.");
    }
  });

  $("#feedEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    updateRecord(data.id, {
      date: dateTimeOrNow(data.date, data.time),
      feedType: data.feedType,
      note: data.note,
      amount: data.amount ? `${Math.round(Number(data.amount))} ml` : ""
    });
    closeFeedEdit();
    showFeedFeedback("✅ Mamada atualizada.");
  });

  $("#cancelFeedEdit").addEventListener("click", closeFeedEdit);

  $("#openMilkForm").addEventListener("click", showMilkForm);
  $("#milkFab").addEventListener("click", showMilkForm);

  $("#milkOtherDate").addEventListener("change", (event) => {
    $("#milkDateWrap").classList.toggle("hidden", !event.target.checked);
  });

  $("#milkForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const useOtherDate = $("#milkOtherDate").checked;
    registerMilk(data.time, useOtherDate ? data.date : todayInput(), data.amount, data.side);
    event.currentTarget.reset();
    $("#milkOtherDate").checked = false;
    $("#milkDateWrap").classList.add("hidden");
    hideMilkForm();
    setDefaultDateFields(event.currentTarget);
  });

  $("#milkHistory").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-milk]");
    const deleteButton = event.target.closest("[data-delete-milk]");
    if (editButton) openMilkEdit(editButton.dataset.editMilk);
    if (deleteButton && await askConfirm("Deseja realmente excluir este registro?")) {
      removeRecord(deleteButton.dataset.deleteMilk);
      showMilkFeedback("✅ Retirada excluída.");
    }
  });

  $("#milkEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    updateRecord(data.id, {
      date: dateTimeOrNow(data.date, data.time),
      amount: data.amount ? `${Math.round(Number(data.amount))} ml` : "",
      side: data.side,
      note: data.note
    });
    closeMilkEdit();
    showMilkFeedback("✅ Retirada atualizada.");
  });

  $("#cancelMilkEdit").addEventListener("click", closeMilkEdit);

  $$("[data-open-elimination]").forEach((button) => {
    button.addEventListener("click", () => openEliminationPicker(button.dataset.openElimination));
  });

  $$("[data-elimination-other-date]").forEach((input) => {
    input.addEventListener("change", () => {
      const kind = input.dataset.eliminationOtherDate;
      $(`#${kind}DateWrap`).classList.toggle("hidden", !input.checked);
    });
  });

  ["poop", "pee"].forEach((kind) => {
    $(`#view-${kind}`).addEventListener("click", async (event) => {
      const saveButton = event.target.closest("[data-save-elimination]");
      const calendarButton = event.target.closest("[data-calendar-day]");
      const dayButton = event.target.closest("[data-show-elimination-day]");
      const editButton = event.target.closest("[data-edit-elimination]");
      const deleteButton = event.target.closest("[data-delete-elimination]");

      if (saveButton) {
        registerElimination(saveButton.dataset.saveElimination, Number(saveButton.dataset.count));
        return;
      }

      if (calendarButton) {
        showEliminationDay(calendarButton.dataset.calendarDay, calendarButton.dataset.date);
        return;
      }

      if (dayButton) {
        showEliminationDay(dayButton.dataset.showEliminationDay, dayButton.dataset.date);
        return;
      }

      if (editButton) {
        openEliminationEdit(editButton.dataset.editElimination, editButton.dataset.id);
        return;
      }

      if (deleteButton && await askConfirm(eliminationConfig[deleteButton.dataset.deleteElimination].deleteMessage)) {
        removeRecord(deleteButton.dataset.id);
        showEliminationFeedback(deleteButton.dataset.deleteElimination, "✅ Registro excluído.");
      }
    });

    $(`#${kind}EditForm`).addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      updateRecord(data.id, {
        date: `${data.date}T12:00`,
        count: Number(data.count),
        note: data.note
      });
      closeEliminationEdit(kind);
      showEliminationFeedback(kind, "✅ Registro atualizado.");
    });

    $(`#${kind}EditForm [data-cancel-elimination]`).addEventListener("click", () => closeEliminationEdit(kind));
  });

  $("#openMedicineForm").addEventListener("click", showMedicineForm);
  $("#medicineFab").addEventListener("click", showMedicineForm);
  $("#cancelMedicineForm").addEventListener("click", hideMedicineForm);
  $("#medicineOtherDate").addEventListener("change", (event) => {
    $("#medicineDateWrap").classList.toggle("hidden", !event.target.checked);
  });
  $("#medicineInterval").addEventListener("change", (event) => {
    $("#medicineCustomIntervalWrap").classList.toggle("hidden", event.target.value !== "custom");
  });
  $("#medicineForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const useOtherDate = $("#medicineOtherDate").checked;
    if (!data.taken) {
      data.taken = window.confirm("O bebê tomou este remédio?\n\nOK = Sim, tomou\nCancelar = Não tomou") ? "yes" : "no";
    }
    registerMedicine({ ...data, date: useOtherDate ? data.date : todayInput() });
    form.reset();
    $("#medicineOtherDate").checked = false;
    $("#medicineDateWrap").classList.add("hidden");
    $("#medicineCustomIntervalWrap").classList.add("hidden");
    setDefaultDateFields(form);
  });
  $("#medicineHistory").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-medicine]");
    const deleteButton = event.target.closest("[data-delete-medicine]");
    if (editButton) openMedicineEdit(editButton.dataset.editMedicine);
    if (deleteButton && await askConfirm("Deseja realmente excluir este medicamento?")) {
      removeRecord(deleteButton.dataset.deleteMedicine);
      showMedicineFeedback("✅ Remédio excluído.");
    }
  });
  $("#medicineEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const date = dateTimeOrNow(data.date, data.time);
    const next = addTime(date, Number(data.intervalHours) * 60);
    updateRecord(data.id, {
      name: data.name,
      dose: data.dose,
      note: data.note,
      taken: data.taken,
      intervalHours: Number(data.intervalHours),
      date,
      next: next?.toISOString()
    });
    closeMedicineEdit();
    showMedicineFeedback("✅ Remédio atualizado.");
  });
  $("#cancelMedicineEdit").addEventListener("click", closeMedicineEdit);

  $("#openAppointmentForm").addEventListener("click", showAppointmentForm);
  $("#appointmentFab").addEventListener("click", showAppointmentForm);
  $("#cancelAppointmentForm").addEventListener("click", hideAppointmentForm);
  $("#appointmentDoctor").addEventListener("change", (event) => {
    $("#appointmentOtherDoctorWrap").classList.toggle("hidden", event.target.value !== "Outro");
  });
  $("#appointmentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    registerAppointment(data);
    form.reset();
    $("#appointmentOtherDoctorWrap").classList.add("hidden");
    setDefaultDateFields(form);
  });
  $("#appointmentCalendar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-appointment-day]");
    if (button) showAppointmentDay(button.dataset.appointmentDay);
  });
  $("#appointmentCalendarDetail").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-appointment]");
    if (editButton) openAppointmentEdit(editButton.dataset.editAppointment);
  });
  $("#appointmentHistory").addEventListener("click", async (event) => {
    const calendarButton = event.target.closest("[data-calendar-appointment]");
    const duplicateButton = event.target.closest("[data-duplicate-appointment]");
    const editButton = event.target.closest("[data-edit-appointment]");
    const deleteButton = event.target.closest("[data-delete-appointment]");
    if (calendarButton) downloadAppointmentCalendar(calendarButton.dataset.calendarAppointment);
    if (duplicateButton) duplicateAppointment(duplicateButton.dataset.duplicateAppointment);
    if (editButton) openAppointmentEdit(editButton.dataset.editAppointment);
    if (deleteButton && await askConfirm("Deseja realmente excluir esta consulta?")) {
      removeRecord(deleteButton.dataset.deleteAppointment);
      showAppointmentFeedback("✅ Consulta excluída.");
    }
  });
  $("#appointmentEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    updateRecord(data.id, {
      doctor: data.doctor,
      place: data.place,
      phone: data.phone,
      note: data.note,
      date: dateTimeOrNow(data.date, data.time)
    });
    closeAppointmentEdit();
    showAppointmentFeedback("✅ Consulta atualizada.");
  });
  $("#cancelAppointmentEdit").addEventListener("click", closeAppointmentEdit);

  $("#timeline").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (button) removeRecord(button.dataset.remove);
  });

  $("#openGrowthForm").addEventListener("click", () => {
    $("#growthForm").classList.remove("hidden");
    setDefaultDateFields($("#growthForm"));
    $("#growthForm").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("#cancelGrowthForm").addEventListener("click", () => $("#growthForm").classList.add("hidden"));

  $("#growthForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const baby = activeBaby();
    const weight = cleanNumber(data.weight);
    const height = cleanNumber(data.height);
    const head = cleanNumber(data.head);
    baby.weight = weight || baby.weight;
    baby.height = height || baby.height;
    baby.records.unshift({
      id: crypto.randomUUID(),
      type: "growth",
      createdAt: new Date().toISOString(),
      date: data.date || todayInput(),
      weight,
      height,
      head
    });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    saveState();
    toast("Medição de crescimento salva");
  });

  $("#growthTable").addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-growth]");
    const deleteButton = event.target.closest("[data-delete-growth]");
    if (editButton) openGrowthEdit(editButton.dataset.editGrowth);
    if (deleteButton && await askConfirm("Deseja realmente excluir esta medição?")) removeRecord(deleteButton.dataset.deleteGrowth);
  });

  $("#growthEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const weight = cleanNumber(data.weight);
    const height = cleanNumber(data.height);
    const head = cleanNumber(data.head);
    updateRecord(data.id, { date: data.date || todayInput(), weight, height, head });
    const latest = growthRecords()[0];
    if (latest) {
      activeBaby().weight = latest.weight || activeBaby().weight;
      activeBaby().height = latest.height || activeBaby().height;
      saveState();
    }
    closeGrowthEdit();
    toast("Medição atualizada");
  });

  $("#cancelGrowthEdit").addEventListener("click", closeGrowthEdit);

  $("#historyFilter").addEventListener("change", render);

  $("#clearOld").addEventListener("click", () => {
    const baby = activeBaby();
    baby.records = baby.records.filter((record) => record.type && (record.date || record.createdAt));
    saveState();
    toast("Dados simples corrigidos");
  });

  $("#photoInput").addEventListener("change", (event) => {
    updateBabyPhotoFromInput(event.target);
  });

  $("#profilePhotoInput").addEventListener("change", (event) => {
    updateBabyPhotoFromInput(event.target);
  });

  function updateBabyPhotoFromInput(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      activeBaby().photo = reader.result;
      saveState();
      toast("Foto atualizada");
    };
    reader.readAsDataURL(file);
  }

  $("#babyProfiles").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-baby]");
    const editButton = event.target.closest("[data-edit-baby]");
    const deleteButton = event.target.closest("[data-delete-baby]");
    if (button) {
      state.activeBabyId = button.dataset.baby;
      saveState();
      toast("Perfil selecionado");
    }
    if (editButton) {
      const baby = state.babies.find((item) => item.id === editButton.dataset.editBaby);
      if (!baby) return;
      state.activeBabyId = baby.id;
      saveState();
      switchTab("profile");
      $("#profileForm").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (deleteButton) {
      if (state.babies.length <= 1) {
        toast("Mantenha pelo menos um bebê cadastrado");
        return;
      }
      if (!await askConfirm("Deseja realmente excluir este bebê e todo o histórico dele?")) return;
      state.babies = state.babies.filter((baby) => baby.id !== deleteButton.dataset.deleteBaby);
      if (!state.babies.some((baby) => baby.id === state.activeBabyId)) state.activeBabyId = state.babies[0].id;
      saveState();
      toast("Bebê excluído");
    }
  });

  $("#addBaby").addEventListener("click", () => {
    const baby = {
      id: crypto.randomUUID(),
      name: `Bebê ${state.babies.length + 1}`,
      birthDate: "",
      sex: "",
      weight: "",
      height: "",
      photo: "assets/baby-clouds.png",
      settings: {},
      records: []
    };
    state.babies.push(baby);
    state.activeBabyId = baby.id;
    saveState();
    toast("Novo perfil criado");
  });

  $("#alertsToggle").addEventListener("change", (event) => {
    state.settings.visualAlerts = event.target.checked;
    saveState();
  });

  $("#exportData").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meu-bebe-backup-${todayInput()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado");
  });

  $("#exportDataTools")?.addEventListener("click", () => $("#exportData").click());

  $("#importData").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = repairState(JSON.parse(reader.result));
        saveState();
        toast("Backup importado");
      } catch {
        toast("Arquivo de backup inválido");
      }
    };
    reader.readAsText(file);
  });

  $("#importDataTools")?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    $("#importData").files = dataTransfer.files;
    $("#importData").dispatchEvent(new Event("change"));
  });
}

function boot() {
  setupForms();
  setupEvents();
  saveState();
  if (location.hash) {
    window.setTimeout(() => openHomeTarget(location.hash.replace("#", "")), 250);
  }
  window.setInterval(render, 60000);
  window.setTimeout(() => $("#splash").classList.add("hide"), 1450);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

boot();
