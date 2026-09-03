import html2canvas from "html2canvas";

/* -------------------------------------------------------------
   DEFAULT DATA & CONFIG
   ------------------------------------------------------------- */
const DEFAULT_PARTICIPANTS = [
  { id: "1", nome: "Darly Fassarela", sexo: "M", presidente: true, oracao: true, tesouros: true, joias: true, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: true, miniterio_discurso: true, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: true },
  { id: "2", nome: "Custodio", sexo: "M", presidente: false, oracao: true, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: false },
  { id: "3", nome: "Moura", sexo: "M", presidente: false, oracao: false, tesouros: true, joias: true, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: true, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: true },
  { id: "4", nome: "Arlan Honorato", sexo: "M", presidente: false, oracao: false, tesouros: true, joias: true, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: true, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: true },
  { id: "5", nome: "Pedro", sexo: "M", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: true, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "6", nome: "Adriane Moura", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "7", nome: "Cassia", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "8", nome: "Deusinete", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "9", nome: "Marcia", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "10", nome: "Vanessa", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "11", nome: "Santilha", sexo: "F", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false },
  { id: "12", nome: "Fassarela", sexo: "M", presidente: false, oracao: false, tesouros: true, joias: true, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: false, miniterio_discurso: true, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: true },
  { id: "13", nome: "Filipe Bodart", sexo: "M", presidente: false, oracao: false, tesouros: true, joias: true, leitura_biblia: false, leitura_estudo_biblico: false, estudo_biblico: true, miniterio_discurso: true, miniterio_publicador: false, miniterio_ajudante: false, vida_crista: true },
  { id: "14", nome: "Arthur", sexo: "M", presidente: false, oracao: false, tesouros: false, joias: false, leitura_biblia: true, leitura_estudo_biblico: true, estudo_biblico: false, miniterio_discurso: false, miniterio_publicador: true, miniterio_ajudante: true, vida_crista: false }
];

// ISO base Monday matching the image date (18 May 2026)
const BASE_MONDAY_ISO = "2026-05-18";

// Portuguese month names
const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

const MINISTRY_PART_OPTIONS = [
  "Iniciando conversas",
  "Cultivando o Interesse",
  "Fazendo discípulos",
  "Explicando suas crenças",
  "Discurso"
];

const DEFAULT_MINISTRY_TIMES = ["3", "4", "5"];
const LEGACY_LOCAL_STORAGE_KEY = "midweek_schedule_state";

/* -------------------------------------------------------------
   APPLICATION STATE
   ------------------------------------------------------------- */
let state = {
  week: BASE_MONDAY_ISO,
  weekText: "18 a 24 de maio",
  participants: DEFAULT_PARTICIPANTS.map(participant => ({ ...participant })),
  loadedWeeksCount: 5,
  weeksData: {} // Map containing weekISO -> weekSpecificData
};

// Internal list of all generated week options
let generatedWeeks = [];
let saveStateTimeout = null;
let saveRequestChain = Promise.resolve();
let lastSaveError = null;
let currentUser = null;
let accessibleCongregations = [];
let activeCongregation = null;
let editorInitialized = false;
const dismissedPairWarnings = new Set();

/* -------------------------------------------------------------
   DEFAULT DATA TEMPLATE GENERATOR
   ------------------------------------------------------------- */
function getDefaultWeekData(weekIso) {
  const isBaseWeek = (weekIso === BASE_MONDAY_ISO);
  
  return {
    location: activeCongregation?.name || "Meaípe",
    title: "Programação da reunião do meio de semana",
    theme: "LEITURA SEMANAL DA BÍBLIA",
    selections: {
      "sel-president": isBaseWeek ? "Darly Fassarela" : "",
      "sel-prayer-1": isBaseWeek ? "Custodio" : "",
      "sel-treasure-p1": isBaseWeek ? "Moura" : "",
      "sel-treasure-p2": isBaseWeek ? "Arlan Honorato" : "",
      "sel-treasure-p3": isBaseWeek ? "Pedro" : "",
      "sel-ministry-p1-student": isBaseWeek ? "Adriane Moura" : "",
      "sel-ministry-p1-assistant": isBaseWeek ? "Cassia" : "",
      "sel-ministry-p2-student": isBaseWeek ? "Deusinete" : "",
      "sel-ministry-p2-assistant": isBaseWeek ? "Marcia" : "",
      "sel-ministry-p3-student": isBaseWeek ? "Vanessa" : "",
      "sel-ministry-p3-assistant": isBaseWeek ? "Santilha" : "",
      "sel-life-p1": isBaseWeek ? "Fassarela" : "",
      "sel-life-conductor": isBaseWeek ? "Filipe Bodart" : "",
      "sel-life-reader": isBaseWeek ? "Arthur" : "",
      "sel-prayer-2": isBaseWeek ? "Darly Fassarela" : ""
    },
    inlineTexts: {
      "txt-song-intro": "Cântico",
      "txt-comments-intro": "Comentários iniciais",
      "txt-treasure-p1": "1. Tesouros ",
      "txt-treasure-p2": "2. Joias espirituais",
      "txt-treasure-p3": "3. Leitura da Bíblia",
      "txt-song-middle": "Cântico",
      "txt-life-p1": "Necessidades Locais",
      "txt-life-p2": "Estudo bíblico de congregação",
      "txt-comments-outro": "Comentários finais",
      "txt-song-outro": "Cântico"
    },
    times: {
      "sel-time-comments-intro": "1",
      "sel-time-treasure-p1": "10",
      "sel-time-treasure-p2": "10",
      "sel-time-treasure-p3": "4",
      "sel-time-ministry-p1": "3",
      "sel-time-ministry-p2": "4",
      "sel-time-ministry-p3": "5",
      "sel-time-life-p1": "15",
      "sel-time-life-p2": "30",
      "sel-time-comments-outro": "3"
    },
    ministryParts: [
      { id: "ministry-p1", type: "Iniciando conversas" },
      { id: "ministry-p2", type: "Cultivando o Interesse" },
      { id: "ministry-p3", type: "Fazendo discípulos" }
    ],
    lifeParts: [
      { id: "life-p1" }
    ]
  };
}

function getCurrentMondayIso() {
  const now = new Date();
  const day = now.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday, 12);
  return monday.toISOString().split("T")[0];
}

function createCongregationState({ initial = false } = {}) {
  const firstWeek = initial ? BASE_MONDAY_ISO : getCurrentMondayIso();
  const firstWeekText = formatWeekRangeFromIso(firstWeek);
  return {
    week: firstWeek,
    weekText: firstWeekText,
    startWeek: firstWeek,
    participants: initial
      ? DEFAULT_PARTICIPANTS.map(participant => ({ ...participant }))
      : [],
    loadedWeeksCount: 5,
    weeksData: {}
  };
}

function createPartId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getMinistryTypeFromText(text, fallbackIndex = 0) {
  const cleaned = (text || "")
    .replace(/^\s*\d+\.\s*/, "")
    .trim()
    .toLowerCase();
  const match = MINISTRY_PART_OPTIONS.find(option => option.toLowerCase() === cleaned);
  return match || MINISTRY_PART_OPTIONS[fallbackIndex] || MINISTRY_PART_OPTIONS[0];
}

function getMinistryTimeId(part) {
  return `sel-time-${part.id}`;
}

function getMinistryStudentId(part) {
  return `sel-${part.id}-student`;
}

function getMinistryAssistantId(part) {
  return `sel-${part.id}-assistant`;
}

function getMinistrySpeakerId(part) {
  return `sel-${part.id}-speaker`;
}

function getMinistryPartBySelectId(selectId, weekData = getCurrentWeekData()) {
  return weekData.ministryParts.find(part => (
    selectId === getMinistryStudentId(part) ||
    selectId === getMinistryAssistantId(part) ||
    selectId === getMinistrySpeakerId(part)
  ));
}

function getMinistryPairKey(student, assistant) {
  return [student, assistant].sort((a, b) => a.localeCompare(b)).join("||");
}

function getMinistryPairDismissKey(partId, student, assistant) {
  return `${state.week}::${partId}::${getMinistryPairKey(student, assistant)}`;
}

function getParticipantByName(name) {
  return state.participants.find(participant => participant.nome === name);
}

function getParticipantGender(name) {
  return getParticipantByName(name)?.sexo || "";
}

function normalizeParticipantName(name) {
  return (name || "").trim().toLowerCase();
}

function getLifeTextId(part) {
  return `txt-${part.id}`;
}

function getLifeTimeId(part) {
  return `sel-time-${part.id}`;
}

function getLifeSpeakerId(part) {
  return `sel-${part.id}`;
}

function ensureWeekDataShape(weekData) {
  weekData.selections = weekData.selections || {};
  weekData.inlineTexts = weekData.inlineTexts || {};
  weekData.times = weekData.times || {};
  
  if (!Array.isArray(weekData.ministryParts)) {
    weekData.ministryParts = [1, 2, 3].map((partNumber, index) => ({
      id: `ministry-p${partNumber}`,
      type: getMinistryTypeFromText(weekData.inlineTexts[`txt-ministry-p${partNumber}`], index)
    }));
  }
  
  if (!Array.isArray(weekData.lifeParts)) {
    weekData.lifeParts = [{ id: "life-p1" }];
  }
  
  weekData.ministryParts.forEach((part, index) => {
    if (!part.id) {
      part.id = createPartId("ministry-part");
    }
    part.type = getMinistryTypeFromText(part.type, index);
    
    const timeId = getMinistryTimeId(part);
    if (!weekData.times[timeId]) {
      weekData.times[timeId] = DEFAULT_MINISTRY_TIMES[index] || "3";
    }
    
    [getMinistryStudentId(part), getMinistryAssistantId(part), getMinistrySpeakerId(part)].forEach(id => {
      if (weekData.selections[id] === undefined) {
        weekData.selections[id] = "";
      }
    });
  });
  
  weekData.lifeParts.forEach((part, index) => {
    if (!part.id) {
      part.id = createPartId("life-part");
    }
    
    const textId = getLifeTextId(part);
    const timeId = getLifeTimeId(part);
    const speakerId = getLifeSpeakerId(part);
    
    if (weekData.inlineTexts[textId] === undefined) {
      weekData.inlineTexts[textId] = index === 0 ? "Necessidades Locais" : "Nova parte";
    }
    if (!weekData.times[timeId]) {
      weekData.times[timeId] = index === 0 ? "15" : "5";
    }
    if (weekData.selections[speakerId] === undefined) {
      weekData.selections[speakerId] = "";
    }
  });
}

/**
 * Returns current week data, or initializes it if absent.
 */
function getCurrentWeekData() {
  const currentWeek = state.week;
  if (!state.weeksData[currentWeek]) {
    state.weeksData[currentWeek] = getDefaultWeekData(currentWeek);
  }
  ensureWeekDataShape(state.weeksData[currentWeek]);
  return state.weeksData[currentWeek];
}

/* -------------------------------------------------------------
   DATE GENERATION HELPERS
   ------------------------------------------------------------- */
function formatWeekRange(monday) {
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  
  const mDay = monday.getDate();
  const mMonth = monday.getMonth();
  const mYear = monday.getFullYear();
  
  const sDay = sunday.getDate();
  const sMonth = sunday.getMonth();
  const sYear = sunday.getFullYear();
  
  const mDayStr = mDay < 10 ? `0${mDay}` : `${mDay}`;
  const sDayStr = sDay < 10 ? `0${sDay}` : `${sDay}`;
  
  if (mYear !== sYear) {
    return `${mDayStr} de ${MONTH_NAMES[mMonth]} de ${mYear} a ${sDayStr} de ${MONTH_NAMES[sMonth]} de ${sYear}`;
  } else if (mMonth !== sMonth) {
    return `${mDayStr} de ${MONTH_NAMES[mMonth]} a ${sDayStr} de ${MONTH_NAMES[sMonth]}`;
  } else {
    return `${mDayStr} a ${sDayStr} de ${MONTH_NAMES[mMonth]}`;
  }
}

function generateWeekOptions(startMondayStr, count) {
  const weeks = [];
  const startParts = startMondayStr.split('-');
  let currentMonday = new Date(Date.UTC(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 12, 0, 0));
  
  for (let i = 0; i < count; i++) {
    const isoString = currentMonday.toISOString().split('T')[0];
    weeks.push({
      value: isoString,
      formattedText: formatWeekRange(currentMonday),
      dateObj: new Date(currentMonday.getTime())
    });
    currentMonday.setTime(currentMonday.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return weeks;
}

function parseWeekIso(weekIso) {
  const parts = weekIso.split("-");
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0));
}

function formatWeekRangeFromIso(weekIso) {
  return formatWeekRange(parseWeekIso(weekIso));
}

function formatRelativeWeekDistance(fromWeekIso, toWeekIso) {
  const fromDate = parseWeekIso(fromWeekIso);
  const toDate = parseWeekIso(toWeekIso);
  const diffWeeks = Math.max(1, Math.round((toDate - fromDate) / (7 * 24 * 60 * 60 * 1000)));
  return diffWeeks === 1 ? "há 1 semana" : `há ${diffWeeks} semanas`;
}

function getStaticAssignmentLabel(selectId) {
  const labels = {
    "sel-president": "Presidente",
    "sel-prayer-1": "Oração",
    "sel-prayer-2": "Oração",
    "sel-treasure-p1": "Tesouros",
    "sel-treasure-p2": "Joias espirituais",
    "sel-treasure-p3": "Leitura da Bíblia",
    "sel-life-conductor": "Estudo bíblico (dirigente)",
    "sel-life-reader": "Estudo bíblico (leitor)"
  };
  return labels[selectId] || "";
}

function getAssignmentLabel(selectId, weekData) {
  const staticLabel = getStaticAssignmentLabel(selectId);
  if (staticLabel) return staticLabel;
  
  const ministryPart = weekData.ministryParts.find(part => (
    selectId === getMinistryStudentId(part) ||
    selectId === getMinistryAssistantId(part) ||
    selectId === getMinistrySpeakerId(part)
  ));
  
  if (ministryPart) {
    if (selectId === getMinistryAssistantId(ministryPart)) {
      return `${ministryPart.type} (ajudante)`;
    }
    return ministryPart.type;
  }
  
  const lifePart = weekData.lifeParts.find(part => selectId === getLifeSpeakerId(part));
  if (lifePart) {
    return weekData.inlineTexts[getLifeTextId(lifePart)] || "Vida cristã";
  }
  
  return "";
}

function getParticipantAssignmentsInWeek(participantName, weekData) {
  ensureWeekDataShape(weekData);
  
  return Object.entries(weekData.selections)
    .filter(([, selectedName]) => selectedName === participantName)
    .map(([selectId]) => getAssignmentLabel(selectId, weekData))
    .filter(Boolean)
    .filter((label, index, labels) => labels.indexOf(label) === index);
}

function enforceCurrentWeekMinistryPairRules() {
  const weekData = getCurrentWeekData();
  let changed = false;
  
  weekData.ministryParts.forEach(part => {
    if (part.type === "Discurso") return;
    
    const studentId = getMinistryStudentId(part);
    const assistantId = getMinistryAssistantId(part);
    const student = weekData.selections[studentId];
    const assistant = weekData.selections[assistantId];
    
    if (!student || !assistant) return;
    
    if (student === assistant || getParticipantGender(student) !== getParticipantGender(assistant)) {
      weekData.selections[assistantId] = "";
      changed = true;
    }
  });
  
  return changed;
}

function getLastAssignmentSummary(participantName) {
  const previousWeeks = Object.entries(state.weeksData)
    .filter(([weekIso]) => weekIso < state.week)
    .sort(([weekA], [weekB]) => weekB.localeCompare(weekA));
  
  for (const [weekIso, weekData] of previousWeeks) {
    const labels = getParticipantAssignmentsInWeek(participantName, weekData);
    if (labels.length > 0) {
      return {
        weekIso,
        weekText: formatWeekRangeFromIso(weekIso),
        relativeText: formatRelativeWeekDistance(weekIso, state.week),
        labels
      };
    }
  }
  
  return null;
}

function formatParticipantOptionText(participantName, summary) {
  if (!summary) return participantName;
  return `${participantName} — ${summary.relativeText}, ${summary.labels.join(" / ")}`;
}

function expandParticipantSelectOptions(select) {
  [...select.options].forEach(option => {
    if (option.dataset.fullText) {
      option.textContent = option.dataset.fullText;
    }
  });
}

function collapseParticipantSelectLabel(select) {
  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption?.dataset.shortText) {
    selectedOption.textContent = selectedOption.dataset.shortText;
  }
}

function findPreviousMinistryPair(student, assistant) {
  if (!student || !assistant || student === assistant) return null;
  
  const targetPairKey = getMinistryPairKey(student, assistant);
  const previousWeeks = Object.entries(state.weeksData)
    .filter(([weekIso]) => weekIso < state.week)
    .sort(([weekA], [weekB]) => weekB.localeCompare(weekA));
  
  for (const [weekIso, weekData] of previousWeeks) {
    ensureWeekDataShape(weekData);
    
    const repeatedPart = weekData.ministryParts.find(part => {
      if (part.type === "Discurso") return false;
      
      const previousStudent = weekData.selections[getMinistryStudentId(part)];
      const previousAssistant = weekData.selections[getMinistryAssistantId(part)];
      if (!previousStudent || !previousAssistant) return false;
      
      return getMinistryPairKey(previousStudent, previousAssistant) === targetPairKey;
    });
    
    if (repeatedPart) {
      return {
        weekIso,
        weekText: formatWeekRangeFromIso(weekIso),
        partType: repeatedPart.type
      };
    }
  }
  
  return null;
}

function updateParticipantNameEverywhere(oldName, newName) {
  Object.values(state.weeksData).forEach(weekData => {
    Object.keys(weekData.selections || {}).forEach(selectId => {
      if (weekData.selections[selectId] === oldName) {
        weekData.selections[selectId] = newName;
      }
    });
  });
}

/* -------------------------------------------------------------
   AUTHENTICATED SERVER PERSISTENCE
   ------------------------------------------------------------- */
function showConnectionError(message) {
  const element = document.getElementById("connection-error");
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearConnectionError() {
  document.getElementById("connection-error")?.classList.add("hidden");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "Não foi possível concluir a operação.");
    error.status = response.status;
    throw error;
  }
  clearConnectionError();
  return payload;
}

function queueStateSave(congregationId, stateSnapshot) {
  saveRequestChain = saveRequestChain.then(async () => {
    await requestJson(`/api/congregations/${congregationId}/state`, {
      method: "PUT",
      body: JSON.stringify(stateSnapshot)
    });
    lastSaveError = null;
  }).catch(error => {
    lastSaveError = error;
    console.error("Failed to save congregation state.", error);
    showConnectionError(error.status === 401
      ? "Sua sessão expirou. Entre novamente para continuar."
      : "Não foi possível salvar. Verifique sua conexão antes de sair.");
    if (error.status === 401) showLogin();
  });
  return saveRequestChain;
}

function saveState() {
  if (!activeCongregation) return;
  const congregationId = activeCongregation.id;
  window.clearTimeout(saveStateTimeout);
  saveStateTimeout = window.setTimeout(() => {
    saveStateTimeout = null;
    queueStateSave(congregationId, structuredClone(state));
  }, 350);
}

async function flushPendingSave() {
  if (saveStateTimeout && activeCongregation) {
    window.clearTimeout(saveStateTimeout);
    saveStateTimeout = null;
    queueStateSave(activeCongregation.id, structuredClone(state));
  }
  await saveRequestChain;
  return !lastSaveError;
}

function mergeLoadedState(loadedState) {
  state = {
    ...state,
    ...loadedState,
    weeksData: loadedState.weeksData || {}
  };
  
  // Migrate from old state format (names array) to new format (participants array)
  if (!state.participants && state.names) {
    state.participants = state.names.map((name, index) => {
      const matched = DEFAULT_PARTICIPANTS.find(dp => dp.nome.toLowerCase() === name.toLowerCase());
      if (matched) {
        return { ...matched, id: String(index + 1) };
      }
      return {
        id: String(Date.now() + index),
        nome: name,
        sexo: "M",
        presidente: true,
        oracao: true,
        tesouros: true,
        joias: true,
        leitura_biblia: true,
        leitura_estudo_biblico: true,
        estudo_biblico: true,
        miniterio_discurso: true,
        miniterio_publicador: true,
        miniterio_ajudante: true,
        vida_crista: true
      };
    });
  }
  
  if (!Array.isArray(state.participants)) state.participants = [];
  state.startWeek = state.startWeek || BASE_MONDAY_ISO;
}

async function loadStateFromServer(congregation) {
  const payload = await requestJson(`/api/congregations/${congregation.id}/state`);
  activeCongregation = payload.congregation || congregation;
  state = createCongregationState({ initial: Boolean(congregation.isInitial) });
  if (payload.state) mergeLoadedState(payload.state);
  if (!payload.state) {
    getCurrentWeekData();
    await queueStateSave(activeCongregation.id, structuredClone(state));
  }
  localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  return true;
}

/* -------------------------------------------------------------
   DOM RENDERING & SETUP
   ------------------------------------------------------------- */

/**
 * Reads all active editor values directly from UI DOM and pulls them into state.
 * Important before week transitions to avoid losing unsaved blurred inputs.
 */
function pullUIValuesIntoState() {
  const weekData = getCurrentWeekData();
  
  weekData.location = document.getElementById("txt-location").textContent.trim();
  weekData.title = document.getElementById("txt-title").textContent.trim();
  weekData.theme = document.getElementById("txt-week-theme").textContent.trim();
  
  document.querySelectorAll(".editable[id]").forEach(el => {
    const id = el.id;
    const text = el.textContent.trim();
    if (id === "txt-location") {
      weekData.location = text;
    } else if (id === "txt-title") {
      weekData.title = text;
    } else if (id === "txt-week-theme") {
      weekData.theme = text;
    } else {
      weekData.inlineTexts[id] = text;
    }
  });
  
  document.querySelectorAll(".ministry-type-select").forEach(select => {
    const part = weekData.ministryParts.find(item => item.id === select.getAttribute("data-part-id"));
    if (part) {
      part.type = select.value;
    }
  });

  document.querySelectorAll(".name-select").forEach(select => {
    weekData.selections[select.id] = select.value;
  });
  
  document.querySelectorAll(".time-select").forEach(select => {
    weekData.times[select.id] = select.value;
  });
}

/**
 * Fills all .time-select elements with options 1 to 30
 */
function fillTimeSelect(select, selectedValue = "1") {
  select.innerHTML = "";
  for (let i = 1; i <= 30; i++) {
    const opt = document.createElement("option");
    opt.value = i.toString();
    opt.textContent = i.toString();
    select.appendChild(opt);
  }
  select.value = selectedValue;
}

function initializeTimeSelectOptions() {
  const selects = document.querySelectorAll(".time-select");
  selects.forEach(select => {
    fillTimeSelect(select, select.value || "1");
  });
}

function createRemovePartButton(section, partId, canRemove) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-remove-part print-hidden";
  button.textContent = "Remover";
  button.setAttribute("data-section", section);
  button.setAttribute("data-part-id", partId);
  button.disabled = !canRemove;
  return button;
}

function renderMinistryParts() {
  const container = document.getElementById("ministry-parts-container");
  const weekData = getCurrentWeekData();
  container.innerHTML = "";
  
  weekData.ministryParts.forEach((part, index) => {
    const row = document.createElement("div");
    row.className = part.type === "Discurso" ? "part-row" : "part-row dual-selects";
    
    const details = document.createElement("div");
    details.className = "part-details";
    
    const number = document.createElement("span");
    number.className = "part-number";
    number.textContent = `${index + 4}.`;
    details.appendChild(number);
    
    const typeSelect = document.createElement("select");
    typeSelect.className = "ministry-type-select part-title-select";
    typeSelect.setAttribute("data-part-id", part.id);
    MINISTRY_PART_OPTIONS.forEach(option => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      typeSelect.appendChild(opt);
    });
    typeSelect.value = part.type;
    details.appendChild(typeSelect);
    
    const timeLabel = document.createElement("span");
    timeLabel.className = "time-label";
    timeLabel.appendChild(document.createTextNode("("));
    const timeSelect = document.createElement("select");
    timeSelect.className = "time-select";
    timeSelect.id = getMinistryTimeId(part);
    fillTimeSelect(timeSelect, weekData.times[timeSelect.id] || DEFAULT_MINISTRY_TIMES[index] || "3");
    timeLabel.appendChild(timeSelect);
    timeLabel.appendChild(document.createTextNode(" min)"));
    details.appendChild(timeLabel);
    
    row.appendChild(details);
    
    if (part.type === "Discurso") {
      const assignee = document.createElement("div");
      assignee.className = "part-assignee";
      const select = document.createElement("select");
      select.className = "name-select";
      select.id = getMinistrySpeakerId(part);
      select.setAttribute("data-role", "Orador");
      select.setAttribute("data-filter", "miniterio_discurso");
      assignee.appendChild(select);
      row.appendChild(assignee);
    } else {
      const pair = document.createElement("div");
      pair.className = "part-assignee-pair";
      
      const studentSelect = document.createElement("select");
      studentSelect.className = "name-select";
      studentSelect.id = getMinistryStudentId(part);
      studentSelect.setAttribute("data-role", "Estudante");
      studentSelect.setAttribute("data-placeholder", "Estudante");
      studentSelect.setAttribute("data-filter", "miniterio_publicador");
      
      const slash = document.createElement("span");
      slash.className = "slash";
      slash.textContent = "/";
      
      const assistantSelect = document.createElement("select");
      assistantSelect.className = "name-select";
      assistantSelect.id = getMinistryAssistantId(part);
      assistantSelect.setAttribute("data-role", "Ajudante");
      assistantSelect.setAttribute("data-placeholder", "Ajudante");
      assistantSelect.setAttribute("data-filter", "miniterio_ajudante");
      
      pair.appendChild(studentSelect);
      pair.appendChild(slash);
      pair.appendChild(assistantSelect);
      row.appendChild(pair);
    }
    
    row.appendChild(createRemovePartButton("ministry", part.id, weekData.ministryParts.length > 1));
    container.appendChild(row);
    
    if (part.type !== "Discurso") {
      const student = weekData.selections[getMinistryStudentId(part)];
      const assistant = weekData.selections[getMinistryAssistantId(part)];
      const previousPair = findPreviousMinistryPair(student, assistant);
      const dismissKey = student && assistant ? getMinistryPairDismissKey(part.id, student, assistant) : "";
      
      if (previousPair && !dismissedPairWarnings.has(dismissKey)) {
        const warning = document.createElement("div");
        warning.className = "pair-warning-pill print-hidden";
        warning.setAttribute("data-dismiss-key", dismissKey);
        warning.innerHTML = `
          <span>Dupla já fez parte junta em ${previousPair.weekText}</span>
          <button type="button" class="btn-dismiss-pair-warning" aria-label="Remover aviso">&times;</button>
        `;
        container.appendChild(warning);
      }
    }
  });
}

function renderLifeParts() {
  const container = document.getElementById("life-parts-container");
  const weekData = getCurrentWeekData();
  container.innerHTML = "";
  
  weekData.lifeParts.forEach((part, index) => {
    const row = document.createElement("div");
    row.className = "part-row";
    
    const details = document.createElement("div");
    details.className = "part-details";
    
    const title = document.createElement("span");
    title.className = "editable part-title life-part-title";
    title.contentEditable = "true";
    title.id = getLifeTextId(part);
    title.textContent = weekData.inlineTexts[title.id] || (index === 0 ? "Necessidades Locais" : "Nova parte");
    details.appendChild(title);
    
    const timeLabel = document.createElement("span");
    timeLabel.className = "time-label";
    timeLabel.appendChild(document.createTextNode("("));
    const timeSelect = document.createElement("select");
    timeSelect.className = "time-select";
    timeSelect.id = getLifeTimeId(part);
    fillTimeSelect(timeSelect, weekData.times[timeSelect.id] || (index === 0 ? "15" : "5"));
    timeLabel.appendChild(timeSelect);
    timeLabel.appendChild(document.createTextNode(" min)"));
    details.appendChild(timeLabel);
    
    const assignee = document.createElement("div");
    assignee.className = "part-assignee";
    const select = document.createElement("select");
    select.className = "name-select";
    select.id = getLifeSpeakerId(part);
    select.setAttribute("data-role", "Orador");
    select.setAttribute("data-filter", "vida_crista");
    assignee.appendChild(select);
    
    row.appendChild(details);
    row.appendChild(assignee);
    row.appendChild(createRemovePartButton("life", part.id, weekData.lifeParts.length > 1));
    container.appendChild(row);
  });
}

/**
 * Loads a week's stored data into the DOM UI
 */
function loadWeekDataIntoUI(weekIso) {
  const weekData = getCurrentWeekData();
  
  // Set headers
  document.getElementById("txt-location").textContent = weekData.location;
  document.getElementById("txt-title").textContent = weekData.title;
  document.getElementById("txt-week-theme").textContent = weekData.theme;

  renderMinistryParts();
  renderLifeParts();
  
  // Set inline texts
  Object.keys(weekData.inlineTexts).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = weekData.inlineTexts[id];
    }
  });

  populateNameSelects();
  
  // Set name selections
  document.querySelectorAll(".name-select").forEach(select => {
    const val = weekData.selections[select.id] || "";
    select.value = val;
    if (!val) {
      select.classList.add("unassigned");
    } else {
      select.classList.remove("unassigned");
    }
  });
  
  // Set time selections
  document.querySelectorAll(".time-select").forEach(select => {
    select.value = weekData.times[select.id] || "1";
  });
  
  // Update week trigger visual
  document.getElementById("selected-week-text").textContent = state.weekText.toUpperCase();
}

/**
 * Populates all native name select elements with current list of names
 */
function populateNameSelects() {
  const selects = document.querySelectorAll(".name-select");
  const weekData = getCurrentWeekData();
  const selectionChanged = enforceCurrentWeekMinistryPairRules();
  
  selects.forEach(select => {
    const id = select.id;
    const currentVal = weekData.selections[id] || "";
    const filterKey = select.getAttribute("data-filter");
    const role = select.getAttribute("data-role") || "Participante";
    const placeholder = select.getAttribute("data-placeholder") || `Selecione ${role}`;
    
    select.innerHTML = "";
    
    // Add default empty option
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = placeholder;
    select.appendChild(emptyOpt);
    
    // Filter participants who have the required privilege
    // Or if the participant is currently assigned to this select, keep them
    const eligibleParticipants = state.participants
      .map((participant, index) => ({
        participant,
        index,
        lastAssignment: getLastAssignmentSummary(participant.nome)
      }))
      .filter(item => {
        if (!filterKey) return true; // fallback
        if (item.participant[filterKey] !== true) return false;
        
        const ministryPart = getMinistryPartBySelectId(id, weekData);
        if (ministryPart && ministryPart.type !== "Discurso") {
          const pairedName = id === getMinistryStudentId(ministryPart)
            ? weekData.selections[getMinistryAssistantId(ministryPart)]
            : weekData.selections[getMinistryStudentId(ministryPart)];
          
          if (pairedName && item.participant.sexo !== getParticipantGender(pairedName)) {
            return false;
          }
        }
        
        return true;
      })
      .sort((a, b) => {
        if (!a.lastAssignment && !b.lastAssignment) return a.index - b.index;
        if (!a.lastAssignment) return -1;
        if (!b.lastAssignment) return 1;
        if (a.lastAssignment.weekIso !== b.lastAssignment.weekIso) {
          return a.lastAssignment.weekIso.localeCompare(b.lastAssignment.weekIso);
        }
        return a.index - b.index;
      });
    
    eligibleParticipants.forEach(({ participant, lastAssignment }) => {
      const opt = document.createElement("option");
      opt.value = participant.nome;
      opt.dataset.shortText = participant.nome;
      opt.dataset.fullText = formatParticipantOptionText(participant.nome, lastAssignment);
      opt.textContent = opt.dataset.fullText;
      if (lastAssignment) {
        opt.title = `${lastAssignment.weekText}: ${lastAssignment.labels.join(" / ")}`;
      }
      select.appendChild(opt);
    });
    
    // Restore value only if the saved participant is still eligible for this role.
    select.value = currentVal;
    if (currentVal && select.value !== currentVal) {
      weekData.selections[id] = "";
      select.value = "";
    }
    
    if (!currentVal) {
      select.classList.add("unassigned");
    } else {
      select.classList.remove("unassigned");
    }

    collapseParticipantSelectLabel(select);
  });
  
  if (selectionChanged) {
    saveState();
  }
}

/**
 * Renders the custom week select dropdown options
 */
function renderWeekDropdownOptions() {
  const container = document.getElementById("week-options-container");
  container.innerHTML = "";
  
  generatedWeeks.forEach(wk => {
    const optDiv = document.createElement("div");
    optDiv.className = "select-option";
    if (wk.value === state.week) {
      optDiv.className += " selected";
    }
    optDiv.textContent = wk.formattedText;
    optDiv.setAttribute("data-value", wk.value);
    
    optDiv.addEventListener("click", () => {
      // 1. Pull current UI inputs to save any modifications made on previous week
      pullUIValuesIntoState();
      
      // 2. Update active week variables
      state.week = wk.value;
      state.weekText = wk.formattedText;
      
      // 3. Load the data of the new week into UI
      loadWeekDataIntoUI(wk.value);
      
      // 4. Update selected class in options list
      document.querySelectorAll(".select-option").forEach(el => el.classList.remove("selected"));
      optDiv.classList.add("selected");
      
      // 5. Close dropdown
      document.getElementById("week-select-dropdown").classList.add("hidden");
      document.getElementById("week-select").classList.remove("active");
      
      saveState();
    });
    
    container.appendChild(optDiv);
  });
  
  document.getElementById("selected-week-text").textContent = state.weekText.toUpperCase();
}

/**
 * Initializes inline editable fields and binds event triggers
 */
function setupInlineEditableFields() {
  document.addEventListener("focusout", (e) => {
    if (!e.target.classList.contains("editable")) return;
    
    const id = e.target.id;
    const text = e.target.textContent.trim();
    const weekData = getCurrentWeekData();
    
    if (id === "txt-location") {
      weekData.location = text;
    } else if (id === "txt-title") {
      weekData.title = text;
    } else if (id === "txt-week-theme") {
      weekData.theme = text;
    } else {
      weekData.inlineTexts[id] = text;
    }
    
    saveState();
  });
}

/**
 * Setup listeners for select changes
 */
function setupSelectListeners() {
  document.addEventListener("pointerdown", (e) => {
    if (e.target.classList?.contains("name-select")) {
      expandParticipantSelectOptions(e.target);
    }
  });

  document.addEventListener("focusout", (e) => {
    if (e.target.classList?.contains("name-select")) {
      collapseParticipantSelectLabel(e.target);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.target.classList?.contains("name-select") &&
      ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)
    ) {
      expandParticipantSelectOptions(e.target);
    }
  });

  document.addEventListener("change", (e) => {
    const select = e.target;
    const weekData = getCurrentWeekData();
    
    if (select.classList.contains("name-select")) {
      const id = select.id;
      const val = select.value;
      const ministryPart = getMinistryPartBySelectId(id, weekData);
      
      weekData.selections[id] = val;
      
      if (ministryPart && ministryPart.type !== "Discurso" && val) {
        const studentId = getMinistryStudentId(ministryPart);
        const assistantId = getMinistryAssistantId(ministryPart);
        const pairedSelectId = id === studentId ? assistantId : studentId;
        const pairedName = weekData.selections[pairedSelectId];
        
        if (
          pairedName === val ||
          (pairedName && getParticipantGender(pairedName) !== getParticipantGender(val))
        ) {
          weekData.selections[pairedSelectId] = "";
          const pairedSelect = document.getElementById(pairedSelectId);
          if (pairedSelect) {
            pairedSelect.value = "";
            pairedSelect.classList.add("unassigned");
          }
        }
      }
      
      if (!val) {
        select.classList.add("unassigned");
      } else {
        select.classList.remove("unassigned");
      }

      collapseParticipantSelectLabel(select);
      
      if (ministryPart && ministryPart.type !== "Discurso") {
        renderMinistryParts();
        populateNameSelects();
      }
      
      saveState();
      return;
    }
    
    if (select.classList.contains("time-select")) {
      weekData.times[select.id] = select.value;
      saveState();
      return;
    }
    
    if (select.classList.contains("ministry-type-select")) {
      const part = weekData.ministryParts.find(item => item.id === select.getAttribute("data-part-id"));
      if (part) {
        part.type = select.value;
        renderMinistryParts();
        populateNameSelects();
        saveState();
      }
    }
  });
}

/**
 * Renders the participants list inside the manage modal table
 */
function renderPeopleTable() {
  const tbody = document.getElementById("people-table-body");
  tbody.innerHTML = "";
  
  [...state.participants]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
    .forEach(p => {
    const tr = document.createElement("tr");
    
    // Name
    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "person-name-input";
    nameInput.value = p.nome;
    nameInput.setAttribute("aria-label", `Nome de ${p.nome}`);
    
    const commitNameChange = () => {
      const oldName = p.nome;
      const newName = nameInput.value.trim();
      
      if (!newName) {
        nameInput.value = oldName;
        return;
      }
      
      if (newName === oldName) return;
      
      const nameAlreadyExists = state.participants.some(item => (
        item.id !== p.id && normalizeParticipantName(item.nome) === normalizeParticipantName(newName)
      ));
      
      if (nameAlreadyExists) {
        alert("Este participante já está cadastrado.");
        nameInput.value = oldName;
        return;
      }
      
      p.nome = newName;
      updateParticipantNameEverywhere(oldName, newName);
      nameInput.setAttribute("aria-label", `Nome de ${newName}`);
      saveState();
      populateNameSelects();
    };
    
    nameInput.addEventListener("blur", commitNameChange);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInput.blur();
      }
      
      if (e.key === "Escape") {
        nameInput.value = p.nome;
        nameInput.blur();
      }
    });
    
    tdName.appendChild(nameInput);
    tr.appendChild(tdName);
    
    // Gender
    const tdGender = document.createElement("td");
    tdGender.className = "col-gender";
    const genderSelect = document.createElement("select");
    genderSelect.className = "person-gender-select";
    genderSelect.setAttribute("aria-label", `Sexo de ${p.nome}`);
    ["M", "F"].forEach(gender => {
      const opt = document.createElement("option");
      opt.value = gender;
      opt.textContent = gender;
      genderSelect.appendChild(opt);
    });
    genderSelect.value = p.sexo;
    genderSelect.addEventListener("change", () => {
      p.sexo = genderSelect.value;
      saveState();
      populateNameSelects();
    });
    tdGender.appendChild(genderSelect);
    tr.appendChild(tdGender);
    
    // Privilege checkboxes
    const privilegeKeys = [
      "presidente", "oracao", "tesouros", "joias", "leitura_biblia",
      "estudo_biblico", "leitura_estudo_biblico", "miniterio_discurso",
      "miniterio_publicador", "miniterio_ajudante", "vida_crista"
    ];
    
    privilegeKeys.forEach(key => {
      const tdPriv = document.createElement("td");
      tdPriv.className = "col-privilege";
      
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "privilege-checkbox";
      cb.checked = p[key] === true;
      cb.setAttribute("data-id", p.id);
      cb.setAttribute("data-privilege", key);
      
      cb.addEventListener("change", (e) => {
        const checked = e.target.checked;
        const part = state.participants.find(item => item.id === p.id);
        if (part) {
          part[key] = checked;
          saveState();
          populateNameSelects();
        }
      });
      
      tdPriv.appendChild(cb);
      tr.appendChild(tdPriv);
    });
    
    // Actions (Delete)
    const tdActions = document.createElement("td");
    tdActions.className = "col-actions";
    
    const btnDel = document.createElement("button");
    btnDel.className = "btn-delete";
    btnDel.textContent = "Excluir";
    btnDel.addEventListener("click", () => {
      if (confirm(`Deseja realmente excluir ${p.nome}?`)) {
        state.participants = state.participants.filter(item => item.id !== p.id);
        saveState();
        renderPeopleTable();
        updatePeopleCountBadge();
        populateNameSelects();
      }
    });
    
    tdActions.appendChild(btnDel);
    tr.appendChild(tdActions);
    
    tbody.appendChild(tr);
  });
}

/**
 * Updates the people count badge on the sidebar
 */
function updatePeopleCountBadge() {
  const el = document.getElementById("people-count-num");
  if (el) {
    el.textContent = state.participants.length.toString();
  }
}

/**
 * Binds modal open/close actions and add-person form handling
 */
function setupModalAndParticipants() {
  const btnManagePeople = document.getElementById("btn-manage-people");
  const modalManagePeople = document.getElementById("modal-manage-people");
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCloseModalFooter = document.getElementById("btn-close-modal-footer");
  const formAddPerson = document.getElementById("form-add-person");
  
  // Open modal
  btnManagePeople.addEventListener("click", () => {
    renderPeopleTable();
    modalManagePeople.classList.remove("hidden");
  });
  
  // Close modal (header X)
  btnCloseModal.addEventListener("click", () => {
    modalManagePeople.classList.add("hidden");
  });
  
  // Close modal (footer Close)
  btnCloseModalFooter.addEventListener("click", () => {
    modalManagePeople.classList.add("hidden");
  });
  
  // Close modal when clicking on background overlay
  modalManagePeople.addEventListener("click", (e) => {
    if (e.target === modalManagePeople) {
      modalManagePeople.classList.add("hidden");
    }
  });
  
  // Add person form submission
  formAddPerson.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("input-person-name");
    const genderSelect = document.getElementById("select-person-gender");
    
    const name = nameInput.value.trim();
    const gender = genderSelect.value;
    
    if (!name) return;
    
    if (state.participants.some(p => normalizeParticipantName(p.nome) === normalizeParticipantName(name))) {
      alert("Este participante já está cadastrado.");
      return;
    }
    
    const newParticipant = {
      id: Date.now().toString(),
      nome: name,
      sexo: gender,
      presidente: false,
      oracao: false,
      tesouros: false,
      joias: false,
      leitura_biblia: false,
      leitura_estudo_biblico: false,
      estudo_biblico: false,
      miniterio_discurso: false,
      miniterio_publicador: false,
      miniterio_ajudante: false,
      vida_crista: false
    };
    
    state.participants.push(newParticipant);
    saveState();
    
    // Clear inputs
    nameInput.value = "";
    genderSelect.value = "M";
    
    // Refresh table and sheet dropdowns
    renderPeopleTable();
    updatePeopleCountBadge();
    populateNameSelects();
  });
}

function setupDynamicPartControls() {
  const btnAddMinistry = document.getElementById("btn-add-ministry-part");
  const btnAddLife = document.getElementById("btn-add-life-part");
  const scheduleSheet = document.getElementById("schedule-sheet");
  
  btnAddMinistry.addEventListener("click", () => {
    pullUIValuesIntoState();
    const weekData = getCurrentWeekData();
    const newPart = {
      id: createPartId("ministry-part"),
      type: MINISTRY_PART_OPTIONS[0]
    };
    
    weekData.ministryParts.push(newPart);
    weekData.times[getMinistryTimeId(newPart)] = "3";
    weekData.selections[getMinistryStudentId(newPart)] = "";
    weekData.selections[getMinistryAssistantId(newPart)] = "";
    weekData.selections[getMinistrySpeakerId(newPart)] = "";
    
    renderMinistryParts();
    populateNameSelects();
    saveState();
  });
  
  btnAddLife.addEventListener("click", () => {
    pullUIValuesIntoState();
    const weekData = getCurrentWeekData();
    const newPart = { id: createPartId("life-part") };
    
    weekData.lifeParts.push(newPart);
    weekData.inlineTexts[getLifeTextId(newPart)] = "Nova parte";
    weekData.times[getLifeTimeId(newPart)] = "5";
    weekData.selections[getLifeSpeakerId(newPart)] = "";
    
    renderLifeParts();
    populateNameSelects();
    saveState();
  });
  
  scheduleSheet.addEventListener("click", (e) => {
    const dismissWarningButton = e.target.closest(".btn-dismiss-pair-warning");
    if (dismissWarningButton) {
      const warning = dismissWarningButton.closest(".pair-warning-pill");
      if (warning) {
        dismissedPairWarnings.add(warning.getAttribute("data-dismiss-key"));
        warning.remove();
      }
      return;
    }
    
    const button = e.target.closest(".btn-remove-part");
    if (!button || button.disabled) return;
    
    pullUIValuesIntoState();
    const weekData = getCurrentWeekData();
    const section = button.getAttribute("data-section");
    const partId = button.getAttribute("data-part-id");
    
    if (section === "ministry" && weekData.ministryParts.length > 1) {
      const part = weekData.ministryParts.find(item => item.id === partId);
      weekData.ministryParts = weekData.ministryParts.filter(item => item.id !== partId);
      if (part) {
        delete weekData.times[getMinistryTimeId(part)];
        delete weekData.selections[getMinistryStudentId(part)];
        delete weekData.selections[getMinistryAssistantId(part)];
        delete weekData.selections[getMinistrySpeakerId(part)];
      }
      renderMinistryParts();
      populateNameSelects();
      saveState();
      return;
    }
    
    if (section === "life" && weekData.lifeParts.length > 1) {
      const part = weekData.lifeParts.find(item => item.id === partId);
      weekData.lifeParts = weekData.lifeParts.filter(item => item.id !== partId);
      if (part) {
        delete weekData.inlineTexts[getLifeTextId(part)];
        delete weekData.times[getLifeTimeId(part)];
        delete weekData.selections[getLifeSpeakerId(part)];
      }
      renderLifeParts();
      populateNameSelects();
      saveState();
    }
  });
}

/**
 * Setup Custom Dropdown Interactivity for the Week Selector
 */
function setupCustomWeekSelector() {
  const selectWrapper = document.getElementById("week-select");
  const trigger = document.getElementById("week-select-trigger");
  const dropdown = document.getElementById("week-select-dropdown");
  const btnLoadMore = document.getElementById("btn-load-more-weeks");
  
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
    selectWrapper.classList.toggle("active");
  });
  
  btnLoadMore.addEventListener("click", (e) => {
    e.stopPropagation(); // Keep dropdown open
    
    const lastGeneratedWeek = generatedWeeks[generatedWeeks.length - 1];
    const nextMonday = new Date(lastGeneratedWeek.dateObj.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const nextMondayISO = nextMonday.toISOString().split('T')[0];
    const newWeeks = generateWeekOptions(nextMondayISO, 5);
    
    generatedWeeks = [...generatedWeeks, ...newWeeks];
    state.loadedWeeksCount += 5;
    saveState();
    
    renderWeekDropdownOptions();
  });
  
  document.addEventListener("click", (e) => {
    if (!selectWrapper.contains(e.target)) {
      dropdown.classList.add("hidden");
      selectWrapper.classList.remove("active");
    }
  });
}

function fillEmptyParticipantSelects() {
  pullUIValuesIntoState();
  
  const weekData = getCurrentWeekData();
  let filledCount = 0;
  const usedParticipants = new Set(
    [
      ...Object.values(weekData.selections || {}),
      ...[...document.querySelectorAll(".name-select")].map(select => select.value)
    ]
      .filter(Boolean)
      .map(normalizeParticipantName)
  );
  
  document.querySelectorAll(".name-select").forEach(select => {
    if (select.value) return;
    
    const ministryPart = getMinistryPartBySelectId(select.id, weekData);
    const blockedValue = ministryPart && ministryPart.type !== "Discurso"
      ? (
          select.id === getMinistryStudentId(ministryPart)
            ? weekData.selections[getMinistryAssistantId(ministryPart)]
            : weekData.selections[getMinistryStudentId(ministryPart)]
        )
      : "";
    const blockedGender = blockedValue ? getParticipantGender(blockedValue) : "";
    const firstRealOption = [...select.options].find(option => {
      const optionKey = normalizeParticipantName(option.value);
      if (!option.value || optionKey === normalizeParticipantName(blockedValue)) return false;
      if (usedParticipants.has(optionKey)) return false;
      if (blockedGender && getParticipantGender(option.value) !== blockedGender) return false;
      return true;
    });
    if (!firstRealOption) return;
    
    select.value = firstRealOption.value;
    weekData.selections[select.id] = firstRealOption.value;
    usedParticipants.add(normalizeParticipantName(firstRealOption.value));
    select.classList.remove("unassigned");
    filledCount += 1;
  });
  
  if (filledCount > 0) {
    renderMinistryParts();
    populateNameSelects();
    saveState();
  }
}

/**
 * Print & Reset Operations
 */
const A4_EXPORT_WIDTH_PX = 2480;
const A4_EXPORT_HEIGHT_PX = 3508;
const A4_EXPORT_SCALE = 2;
const A4_EXPORT_CSS_WIDTH = A4_EXPORT_WIDTH_PX / A4_EXPORT_SCALE;
const A4_EXPORT_CSS_HEIGHT = A4_EXPORT_HEIGHT_PX / A4_EXPORT_SCALE;

function replaceSelectsWithExportText(clonedSheet, selector, className, getText) {
  clonedSheet.querySelectorAll(selector).forEach(select => {
    const text = getText(select);
    const replacement = clonedSheet.ownerDocument.createElement("span");
    replacement.className = `export-select-text ${className}`;
    replacement.textContent = text;

    if (!text) {
      replacement.classList.add("is-empty");
    }

    select.replaceWith(replacement);
  });
}

function prepareSheetCloneForImageExport(clonedDocument) {
  const clonedSheet = clonedDocument.getElementById("schedule-sheet");
  if (!clonedSheet) return;

  clonedSheet.classList.add("image-export-sheet");
  clonedSheet.style.width = `${A4_EXPORT_CSS_WIDTH}px`;
  clonedSheet.style.minWidth = `${A4_EXPORT_CSS_WIDTH}px`;
  clonedSheet.style.maxWidth = `${A4_EXPORT_CSS_WIDTH}px`;
  clonedSheet.style.flex = `0 0 ${A4_EXPORT_CSS_WIDTH}px`;
  clonedSheet.style.height = `${A4_EXPORT_CSS_HEIGHT}px`;
  clonedSheet.style.minHeight = `${A4_EXPORT_CSS_HEIGHT}px`;

  const renderedWidth = Math.round(clonedSheet.getBoundingClientRect().width);
  if (renderedWidth !== A4_EXPORT_CSS_WIDTH) {
    throw new Error(
      `Unexpected export sheet width: ${renderedWidth}px instead of ${A4_EXPORT_CSS_WIDTH}px.`
    );
  }

  replaceSelectsWithExportText(
    clonedSheet,
    ".name-select",
    "export-name-text",
    select => select.value.trim()
  );

  replaceSelectsWithExportText(
    clonedSheet,
    ".time-select",
    "export-time-text",
    select => (select.options[select.selectedIndex]?.textContent || select.value).trim()
  );

  replaceSelectsWithExportText(
    clonedSheet,
    ".ministry-type-select",
    "export-ministry-type-text",
    select => (select.options[select.selectedIndex]?.textContent || select.value).trim()
  );

  clonedSheet.querySelectorAll(".part-assignee-pair").forEach(pair => {
    const filledNames = [...pair.querySelectorAll(".export-name-text")]
      .filter(name => name.textContent.trim());

    if (filledNames.length < 2) {
      pair.querySelectorAll(".slash").forEach(slash => {
        slash.style.display = "none";
      });
    }
  });
}

function downloadCanvasAsPng(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Failed to convert the exported canvas to PNG."));
        return;
      }

      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = imageUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Keep the object URL alive long enough for mobile browsers to start
      // consuming the file before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000);
      resolve();
    }, "image/png");
  });
}

function setupPanelActions() {
  const btnFillParticipants = document.getElementById("btn-fill-participants");
  const btnPrint = document.getElementById("btn-print");
  const btnReset = document.getElementById("btn-reset");
  
  btnFillParticipants.addEventListener("click", () => {
    fillEmptyParticipantSelects();
  });
  
  btnPrint.addEventListener("click", async () => {
    pullUIValuesIntoState(); // Pull any final unblurred inputs before printing
    saveState();
    
    btnPrint.disabled = true;
    btnPrint.textContent = "Gerando imagem...";
    
    const sheet = document.getElementById("schedule-sheet");
    const hiddenDuringExport = [...sheet.querySelectorAll(".print-hidden")];
    hiddenDuringExport.forEach(el => {
      el.dataset.previousDisplay = el.style.display;
      el.style.display = "none";
    });
    
    try {
      const canvas = await html2canvas(sheet, {
        backgroundColor: "#ffffff",
        scale: A4_EXPORT_SCALE,
        width: A4_EXPORT_CSS_WIDTH,
        height: A4_EXPORT_CSS_HEIGHT,
        windowWidth: A4_EXPORT_CSS_WIDTH,
        windowHeight: A4_EXPORT_CSS_HEIGHT,
        useCORS: true,
        onclone: prepareSheetCloneForImageExport
      });

      if (canvas.width !== A4_EXPORT_WIDTH_PX || canvas.height !== A4_EXPORT_HEIGHT_PX) {
        throw new Error(
          `Unexpected export size: ${canvas.width}x${canvas.height}px.`
        );
      }

      await downloadCanvasAsPng(canvas, `programacao-${state.week}.png`);
    } catch (error) {
      console.error("Failed to export schedule image.", error);
      alert("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      hiddenDuringExport.forEach(el => {
        el.style.display = el.dataset.previousDisplay || "";
        delete el.dataset.previousDisplay;
      });
      btnPrint.disabled = false;
      btnPrint.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Baixar Imagem
        `;
    }
  });
  
  btnReset.addEventListener("click", async () => {
    if (confirm("Deseja redefinir a programação desta congregação?")) {
      state = createCongregationState({ initial: false });
      generatedWeeks = generateWeekOptions(state.startWeek, state.loadedWeeksCount);
      loadWeekDataIntoUI(state.week);
      renderWeekDropdownOptions();
      await queueStateSave(activeCongregation.id, structuredClone(state));
    }
  });
}

function hideApplicationViews() {
  document.getElementById("editor-view").classList.add("hidden");
  document.getElementById("congregation-picker").classList.add("hidden");
  document.getElementById("admin-view").classList.add("hidden");
}

function showLogin(message = "") {
  hideApplicationViews();
  const overlay = document.getElementById("login-overlay");
  overlay.classList.remove("hidden");
  document.getElementById("login-error").textContent = message;
  window.setTimeout(() => document.getElementById("login-username").focus(), 0);
}

function initializeEditorOnce() {
  if (editorInitialized) return;
  setupModalAndParticipants();
  initializeTimeSelectOptions();
  setupInlineEditableFields();
  setupSelectListeners();
  setupDynamicPartControls();
  setupCustomWeekSelector();
  setupPanelActions();
  editorInitialized = true;
}

async function openCongregation(congregation) {
  if (activeCongregation && !document.getElementById("editor-view").classList.contains("hidden")) {
    pullUIValuesIntoState();
    if (!await flushPendingSave()) return;
  }
  hideApplicationViews();
  initializeEditorOnce();
  try {
    await loadStateFromServer(congregation);
    generatedWeeks = generateWeekOptions(state.startWeek || BASE_MONDAY_ISO, state.loadedWeeksCount);
    updatePeopleCountBadge();
    loadWeekDataIntoUI(state.week);
    renderWeekDropdownOptions();
    document.getElementById("current-congregation-name").textContent = activeCongregation.name;
    document.querySelector(".panel-footer p").textContent = `Congregação ${activeCongregation.name}`;
    const canSwitch = currentUser.role === "admin" || accessibleCongregations.length > 1;
    document.getElementById("btn-switch-congregation").classList.toggle("hidden", !canSwitch);
    document.getElementById("btn-open-admin").classList.toggle("hidden", currentUser.role !== "admin");
    document.getElementById("editor-view").classList.remove("hidden");
    document.getElementById("login-overlay").classList.add("hidden");
    history.replaceState({}, "", "/");
  } catch (error) {
    showConnectionError(error.message);
    if (error.status === 401) showLogin("Sua sessão expirou. Entre novamente.");
    else {
      try { await refreshAccessibleCongregations(); } catch (refreshError) { console.warn(refreshError); }
      await showCongregationPicker();
    }
  }
}

function renderCongregationPicker() {
  const list = document.getElementById("congregation-picker-list");
  const empty = document.getElementById("picker-empty");
  list.innerHTML = "";
  accessibleCongregations.forEach(congregation => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "picker-item";
    const name = document.createElement("span");
    name.textContent = congregation.name;
    const action = document.createElement("small");
    action.textContent = "Abrir programação →";
    button.append(name, action);
    button.addEventListener("click", () => openCongregation(congregation));
    list.appendChild(button);
  });
  empty.classList.toggle("hidden", accessibleCongregations.length > 0);
  document.getElementById("btn-picker-admin").classList.toggle("hidden", currentUser?.role !== "admin");
}

async function showCongregationPicker() {
  if (activeCongregation && !document.getElementById("editor-view").classList.contains("hidden")) {
    pullUIValuesIntoState();
    if (!await flushPendingSave()) return;
  }
  hideApplicationViews();
  renderCongregationPicker();
  document.getElementById("congregation-picker").classList.remove("hidden");
  document.getElementById("login-overlay").classList.add("hidden");
  history.replaceState({}, "", "/");
}

function buildChecklist(container, items, selectedIds, prefix) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "check-empty";
    empty.textContent = "Nenhuma opção cadastrada.";
    container.appendChild(empty);
    return;
  }
  const selected = new Set(selectedIds.map(Number));
  items.forEach(item => {
    const label = document.createElement("label");
    label.className = "check-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.id = `${prefix}-${item.id}`;
    checkbox.checked = selected.has(Number(item.id));
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(item.name || item.username));
    container.appendChild(label);
  });
}

const checkedIds = container => [...container.querySelectorAll('input[type="checkbox"]:checked')].map(input => Number(input.value));

async function loadAdminData() {
  const [congregationPayload, userPayload] = await Promise.all([
    requestJson("/api/admin/congregations"),
    requestJson("/api/admin/users")
  ]);
  return { congregations: congregationPayload.congregations, users: userPayload.users };
}

function setCardMessage(card, message, isError = false) {
  const element = card.querySelector(".card-message");
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function renderAdminCongregations(congregations, users) {
  const list = document.getElementById("admin-congregation-list");
  list.innerHTML = "";
  congregations.forEach(congregation => {
    const card = document.createElement("article");
    card.className = `admin-item ${congregation.active ? "" : "is-inactive"}`;
    card.innerHTML = `
      <div class="admin-item-title-row">
        <input class="admin-name-input" value="" aria-label="Nome da congregação">
        <span class="status-badge">${congregation.active ? "Ativa" : "Desativada"}</span>
      </div>
      <div class="item-checklist"></div>
      <div class="admin-item-actions">
        <button type="button" class="btn btn-primary btn-sm btn-save">Salvar alterações</button>
        <button type="button" class="btn btn-secondary btn-sm btn-open" ${congregation.active ? "" : "disabled"}>Acessar programação</button>
        <button type="button" class="btn btn-secondary btn-sm btn-toggle">${congregation.active ? "Desativar" : "Reativar"}</button>
      </div>
      <p class="card-message form-message" aria-live="polite"></p>`;
    const nameInput = card.querySelector(".admin-name-input");
    nameInput.value = congregation.name;
    buildChecklist(card.querySelector(".item-checklist"), users, congregation.userIds, `cong-${congregation.id}`);
    card.querySelector(".btn-save").addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/congregations/${congregation.id}`, {
          method: "PATCH", body: JSON.stringify({ name: nameInput.value })
        });
        await requestJson(`/api/admin/congregations/${congregation.id}/access`, {
          method: "PUT", body: JSON.stringify({ userIds: checkedIds(card.querySelector(".item-checklist")) })
        });
        setCardMessage(card, "Alterações salvas.");
        await refreshAccessibleCongregations();
      } catch (error) { setCardMessage(card, error.message, true); }
    });
    card.querySelector(".btn-open").addEventListener("click", () => openCongregation(congregation));
    card.querySelector(".btn-toggle").addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/congregations/${congregation.id}`, {
          method: "PATCH", body: JSON.stringify({ active: !congregation.active })
        });
        await showAdmin();
      } catch (error) { setCardMessage(card, error.message, true); }
    });
    list.appendChild(card);
  });
}

function renderAdminUsers(users, congregations) {
  const list = document.getElementById("admin-user-list");
  list.innerHTML = "";
  users.forEach(user => {
    const card = document.createElement("article");
    card.className = `admin-item ${user.active ? "" : "is-inactive"}`;
    card.innerHTML = `
      <div class="admin-item-title-row">
        <input class="admin-name-input" value="" aria-label="Nome do usuário">
        <span class="status-badge">${user.active ? "Ativo" : "Desativado"}</span>
      </div>
      <div class="item-checklist"></div>
      <div class="password-reset-row">
        <input type="password" minlength="8" placeholder="Nova senha (mínimo 8 caracteres)" autocomplete="new-password">
        <button type="button" class="btn btn-secondary btn-sm btn-password">Redefinir senha</button>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="btn btn-primary btn-sm btn-save">Salvar alterações</button>
        <button type="button" class="btn btn-secondary btn-sm btn-toggle">${user.active ? "Desativar" : "Reativar"}</button>
      </div>
      <p class="card-message form-message" aria-live="polite"></p>`;
    const usernameInput = card.querySelector(".admin-name-input");
    usernameInput.value = user.username;
    buildChecklist(card.querySelector(".item-checklist"), congregations, user.congregationIds, `user-${user.id}`);
    card.querySelector(".btn-save").addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/users/${user.id}`, {
          method: "PATCH", body: JSON.stringify({ username: usernameInput.value })
        });
        await requestJson(`/api/admin/users/${user.id}/access`, {
          method: "PUT", body: JSON.stringify({ congregationIds: checkedIds(card.querySelector(".item-checklist")) })
        });
        setCardMessage(card, "Alterações salvas.");
      } catch (error) { setCardMessage(card, error.message, true); }
    });
    card.querySelector(".btn-password").addEventListener("click", async () => {
      const input = card.querySelector('.password-reset-row input');
      try {
        await requestJson(`/api/admin/users/${user.id}/password`, {
          method: "POST", body: JSON.stringify({ password: input.value })
        });
        input.value = "";
        setCardMessage(card, "Senha redefinida e sessões anteriores encerradas.");
      } catch (error) { setCardMessage(card, error.message, true); }
    });
    card.querySelector(".btn-toggle").addEventListener("click", async () => {
      try {
        await requestJson(`/api/admin/users/${user.id}`, {
          method: "PATCH", body: JSON.stringify({ active: !user.active })
        });
        await showAdmin();
      } catch (error) { setCardMessage(card, error.message, true); }
    });
    list.appendChild(card);
  });
}

async function refreshAccessibleCongregations() {
  const payload = await requestJson("/api/auth/me");
  currentUser = payload.user;
  accessibleCongregations = payload.congregations;
}

async function showAdmin() {
  if (currentUser?.role !== "admin") return;
  if (activeCongregation && !document.getElementById("editor-view").classList.contains("hidden")) {
    pullUIValuesIntoState();
    if (!await flushPendingSave()) return;
  }
  hideApplicationViews();
  document.getElementById("admin-view").classList.remove("hidden");
  document.getElementById("login-overlay").classList.add("hidden");
  history.replaceState({}, "", "/admin");
  try {
    const { congregations, users } = await loadAdminData();
    buildChecklist(document.getElementById("new-congregation-users"), users.filter(user => user.active), [], "new-cong-user");
    buildChecklist(document.getElementById("new-user-congregations"), congregations.filter(item => item.active), [], "new-user-cong");
    renderAdminCongregations(congregations, users);
    renderAdminUsers(users, congregations);
    await refreshAccessibleCongregations();
  } catch (error) {
    if (error.status === 401) showLogin("Sua sessão expirou. Entre novamente.");
    else showConnectionError(error.message);
  }
}

async function routeAuthenticatedUser() {
  document.getElementById("login-overlay").classList.add("hidden");
  if (currentUser.role === "admin") {
    await showAdmin();
  } else if (accessibleCongregations.length === 1) {
    await openCongregation(accessibleCongregations[0]);
  } else {
    await showCongregationPicker();
  }
}

async function refreshSessionAndRoute() {
  try {
    const payload = await requestJson("/api/auth/me");
    currentUser = payload.user;
    accessibleCongregations = payload.congregations;
    await routeAuthenticatedUser();
  } catch (error) {
    if (error.status === 401) showLogin();
    else {
      showLogin("Não foi possível conectar ao servidor.");
      showConnectionError("Servidor indisponível. O editor não foi aberto para evitar perda ou mistura de dados.");
    }
  }
}

async function logout() {
  if (activeCongregation && !document.getElementById("editor-view").classList.contains("hidden")) {
    pullUIValuesIntoState();
    if (!await flushPendingSave()) return;
  }
  try { await requestJson("/api/auth/logout", { method: "POST" }); } catch (error) { console.warn(error); }
  currentUser = null;
  accessibleCongregations = [];
  activeCongregation = null;
  showLogin();
}

function setupApplicationControls() {
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const errorElement = document.getElementById("login-error");
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    errorElement.textContent = "";
    try {
      const payload = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
      });
      currentUser = payload.user;
      accessibleCongregations = payload.congregations;
      passwordInput.value = "";
      await routeAuthenticatedUser();
    } catch (error) {
      errorElement.textContent = error.message;
      passwordInput.select();
    } finally { submit.disabled = false; }
  });

  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-picker-logout").addEventListener("click", logout);
  document.getElementById("btn-admin-logout").addEventListener("click", logout);
  document.getElementById("btn-switch-congregation").addEventListener("click", showCongregationPicker);
  document.getElementById("btn-open-admin").addEventListener("click", showAdmin);
  document.getElementById("btn-picker-admin").addEventListener("click", showAdmin);
  document.getElementById("btn-admin-back").addEventListener("click", showCongregationPicker);

  document.getElementById("form-add-congregation").addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("input-congregation-name");
    const newUsername = document.getElementById("input-congregation-new-username");
    const newPassword = document.getElementById("input-congregation-new-password");
    const message = document.getElementById("congregation-form-message");
    try {
      await requestJson("/api/admin/congregations", {
        method: "POST",
        body: JSON.stringify({
          name: input.value,
          userIds: checkedIds(document.getElementById("new-congregation-users")),
          newUser: newUsername.value || newPassword.value
            ? { username: newUsername.value, password: newPassword.value }
            : null
        })
      });
      input.value = "";
      newUsername.value = "";
      newPassword.value = "";
      message.textContent = "Congregação criada.";
      message.classList.remove("is-error");
      await showAdmin();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    }
  });

  document.getElementById("form-add-user").addEventListener("submit", async event => {
    event.preventDefault();
    const username = document.getElementById("input-new-username");
    const password = document.getElementById("input-new-password");
    const message = document.getElementById("user-form-message");
    try {
      await requestJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: username.value,
          password: password.value,
          congregationIds: checkedIds(document.getElementById("new-user-congregations"))
        })
      });
      username.value = "";
      password.value = "";
      message.textContent = "Usuário criado.";
      message.classList.remove("is-error");
      await showAdmin();
    } catch (error) {
      message.textContent = error.message;
      message.classList.add("is-error");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && activeCongregation && !document.getElementById("editor-view").classList.contains("hidden")) {
      pullUIValuesIntoState();
      flushPendingSave();
    }
  });
}

async function init() {
  setupApplicationControls();
  await refreshSessionAndRoute();
}

window.addEventListener("DOMContentLoaded", init);
