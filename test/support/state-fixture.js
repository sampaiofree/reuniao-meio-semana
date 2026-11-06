import { PARTICIPANT_PRIVILEGES } from "../../state-validation.js";

export function makePerson(id = "1", nome = "Pessoa de teste") {
  return { id, nome, sexo: "M", ...Object.fromEntries(PARTICIPANT_PRIVILEGES.map(key => [key, true])) };
}

export function makeWeek() {
  return {
    location: "Congregação de teste", title: "Programação", theme: "Leitura",
    selections: Object.fromEntries([
      "sel-president", "sel-prayer-1", "sel-treasure-p1", "sel-treasure-p2", "sel-treasure-p3",
      "sel-life-conductor", "sel-life-reader", "sel-prayer-2", "sel-ministry-p1-student",
      "sel-ministry-p1-assistant", "sel-ministry-p1-speaker", "sel-life-p1"
    ].map(id => [id, id === "sel-president" ? "Pessoa de teste" : ""])),
    inlineTexts: Object.fromEntries([
      "txt-song-intro", "txt-comments-intro", "txt-treasure-p1", "txt-treasure-p2", "txt-treasure-p3",
      "txt-song-middle", "txt-life-p1", "txt-life-p2", "txt-comments-outro", "txt-song-outro"
    ].map(id => [id, "Texto"])),
    times: Object.fromEntries([
      "sel-time-comments-intro", "sel-time-treasure-p1", "sel-time-treasure-p2", "sel-time-treasure-p3",
      "sel-time-life-p1", "sel-time-life-p2", "sel-time-comments-outro", "sel-time-ministry-p1"
    ].map(id => [id, "3"])),
    ministryParts: [{ id: "ministry-p1", type: "Discurso" }],
    lifeParts: [{ id: "life-p1" }]
  };
}

export function makeState() {
  return {
    week: "2026-11-02", weekText: "02 a 08 de novembro", startWeek: "2026-11-02",
    loadedWeeksCount: 5, participants: [makePerson()], weeksData: { "2026-11-02": makeWeek() }
  };
}
