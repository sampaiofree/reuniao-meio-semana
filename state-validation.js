export const PARTICIPANT_PRIVILEGES = [
  "presidente", "oracao", "tesouros", "joias", "leitura_biblia",
  "estudo_biblico", "leitura_estudo_biblico", "miniterio_discurso",
  "miniterio_publicador", "miniterio_ajudante", "vida_crista"
];

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string";
const isId = value => isText(value) && value.trim().length > 0;
const isDate = value => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const isStringMap = value => isObject(value) && Object.values(value).every(isText);
const REQUIRED_WEEK_FIELDS = {
  selections: ["sel-president", "sel-prayer-1", "sel-treasure-p1", "sel-treasure-p2", "sel-treasure-p3", "sel-life-conductor", "sel-life-reader", "sel-prayer-2"],
  inlineTexts: ["txt-song-intro", "txt-comments-intro", "txt-treasure-p1", "txt-treasure-p2", "txt-treasure-p3", "txt-song-middle", "txt-life-p2", "txt-comments-outro", "txt-song-outro"],
  times: ["sel-time-comments-intro", "sel-time-treasure-p1", "sel-time-treasure-p2", "sel-time-treasure-p3", "sel-time-life-p2", "sel-time-comments-outro"]
};

function validParts(parts, ministry) {
  return Array.isArray(parts) && parts.length > 0
    && parts.every(part => isObject(part) && isId(part.id) && (!ministry || isId(part.type)))
    && new Set(parts.map(part => part.id)).size === parts.length;
}

// Legacy reads accept omitted fields that the editor can explicitly migrate, never wrong types.
// Writes must contain the complete current format.
export function validateState(state, { legacy = false } = {}) {
  if (!isObject(state) || !isDate(state.week) || !isObject(state.weeksData)) {
    return "Estado inválido: informe a semana e os dados das programações.";
  }
  for (const [key, valid] of [
    ["weekText", isId], ["startWeek", isDate],
    ["loadedWeeksCount", value => Number.isSafeInteger(value) && value > 0]
  ]) {
    if (!(legacy && state[key] === undefined) && !valid(state[key])) {
      return `Estado inválido: campo ${key}.`;
    }
  }
  if (legacy && state.participants === undefined && Array.isArray(state.names)) {
    if (!state.names.every(isId)) return "Lista antiga de pessoas inválida.";
  } else {
    if (!Array.isArray(state.participants)) return "A lista de pessoas é obrigatória.";
    const ids = new Set();
    for (const person of state.participants) {
      if (!isObject(person) || !isId(person.id) || !isId(person.nome) || ids.has(person.id)) {
        return "Pessoas devem ter identificadores únicos e nomes preenchidos.";
      }
      ids.add(person.id);
      if (!(legacy && person.sexo === undefined) && !["M", "F"].includes(person.sexo)) {
        return "Sexo da pessoa inválido.";
      }
      if (PARTICIPANT_PRIVILEGES.some(key => !(legacy && person[key] === undefined) && typeof person[key] !== "boolean")) {
        return "Privilégios da pessoa inválidos ou incompletos.";
      }
    }
  }
  for (const [week, data] of Object.entries(state.weeksData)) {
    if (!isDate(week) || !isObject(data)) return "Programação semanal inválida.";
    for (const key of ["location", "title", "theme"]) {
      if (!(legacy && data[key] === undefined) && !isText(data[key])) return `Programação inválida: campo ${key}.`;
    }
    for (const key of ["selections", "inlineTexts", "times"]) {
      if (!(legacy && data[key] === undefined) && !isStringMap(data[key])) return `Programação inválida: campo ${key}.`;
    }
    if (!(legacy && data.ministryParts === undefined) && !validParts(data.ministryParts, true)) {
      return "Partes do ministério inválidas ou com identificadores repetidos.";
    }
    if (!(legacy && data.lifeParts === undefined) && !validParts(data.lifeParts, false)) {
      return "Partes de vida cristã inválidas ou com identificadores repetidos.";
    }
    if (data.ministryParts && data.lifeParts) {
      const ids = [...data.ministryParts, ...data.lifeParts].map(part => part.id);
      if (new Set(ids).size !== ids.length) return "Identificadores de partes repetidos.";
    }
    if (!legacy) {
      const required = Object.fromEntries(Object.entries(REQUIRED_WEEK_FIELDS).map(([key, fields]) => [key, [...fields]]));
      for (const part of data.ministryParts) {
        required.times.push(`sel-time-${part.id}`);
        required.selections.push(`sel-${part.id}-student`, `sel-${part.id}-assistant`, `sel-${part.id}-speaker`);
      }
      for (const part of data.lifeParts) {
        required.times.push(`sel-time-${part.id}`);
        required.selections.push(`sel-${part.id}`);
        required.inlineTexts.push(`txt-${part.id}`);
      }
      if (Object.entries(required).some(([key, fields]) => fields.some(field => !Object.hasOwn(data[key], field)))) {
        return "Programação semanal incompleta.";
      }
    }
  }
  if (!legacy && !Object.hasOwn(state.weeksData, state.week)) return "A programação da semana selecionada é obrigatória.";
  return null;
}
