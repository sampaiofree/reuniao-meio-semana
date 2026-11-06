import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { makeState } from "./support/state-fixture.js";
import { validateState } from "../state-validation.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
let run = 0;
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail("A interface não atingiu o estado esperado.");
    await tick();
  }
}

async function editor(t, { initial = makeState(), loadFailure = false, congregations = [{ id: 1, name: "Teste", isInitial: false }] } = {}) {
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const { window } = dom;
  const database = new Map(congregations.map(congregation => [congregation.id, { state: structuredClone(initial), version: initial === null ? 0 : 1 }]));
  const calls = [];
  const confirmations = [];
  const controls = { failSave: false, invalidLoad: false, confirm: true };
  const globals = {
    window, document: window.document, history: window.history, localStorage: window.localStorage,
    getComputedStyle: window.getComputedStyle.bind(window),
    confirm: message => { confirmations.push(message); return controls.confirm; },
    alert: message => { throw new Error(message); },
    fetch: async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, ...options, method });
      const response = (payload, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(payload) });
      if (url === "/api/auth/me") return response({ user: { id: 1, role: "user" }, congregations });
      const match = url.match(/^\/api\/congregations\/(\d+)\/(state|participants\/[^/]+)$/);
      if (!match) throw new Error(`Unexpected request: ${method} ${url}`);
      const id = Number(match[1]);
      const saved = database.get(id);
      if (method === "GET") {
        if (loadFailure) throw new Error("Falha ao carregar a congregação");
        return response(controls.invalidLoad ? { state: {}, version: saved.version, congregation: congregations.find(c => c.id === id) }
          : { ...saved, congregation: congregations.find(c => c.id === id) });
      }
      if (controls.failSave) throw new Error("Sem conexão");
      if (options.headers["If-Match"] !== `"${saved.version}"`) return response({ error: "Outra sessão alterou os dados." }, 409);
      if (method === "PUT") {
        const state = JSON.parse(options.body);
        const invalid = validateState(state);
        if (invalid) return response({ error: invalid }, 400);
        database.set(id, { state, version: saved.version + 1 });
      } else {
        const personId = decodeURIComponent(match[2].split("/")[1]);
        saved.state.participants = saved.state.participants.filter(person => person.id !== personId);
        saved.version++;
      }
      const result = database.get(id);
      return response({ ok: true, ...result });
    }
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(async () => {
    // Complete any debounce before disposing the DOM and restoring globals.
    await new Promise(resolve => setTimeout(resolve, 400));
    window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../main.js?test=${++run}`);
  window.dispatchEvent(new window.Event("DOMContentLoaded"));
  const $ = selector => window.document.querySelector(selector);
  const edit = (selector, value) => {
    $(selector).textContent = value;
    $(selector).dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  };
  return { $, edit, window, database, calls, confirmations, controls };
}

test("editor saves edits, blocks stale writes and asks before discarding local changes", async t => {
  const ui = await editor(t);
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  assert.equal(ui.$("#btn-reset"), null);
  ui.edit("#txt-week-theme", "Edição salva");
  assert.equal(ui.$("#save-status").textContent, "Alterações pendentes");
  await until(() => ui.$("#save-status").textContent === "Salvo");
  assert.equal(ui.database.get(1).state.weeksData["2026-11-02"].theme, "Edição salva");
  ui.database.get(1).version++; // Another session saved after this editor loaded.
  ui.edit("#txt-week-theme", "Edição local em conflito");
  await until(() => ui.$("#save-status").textContent === "Falha ao salvar");
  assert.equal(ui.$(".app-container").inert, true);
  assert.equal(ui.$("#txt-week-theme").textContent, "Edição local em conflito");
  assert.equal(ui.$("#btn-reload-state").classList.contains("hidden"), false);
  assert.equal(ui.$("#btn-retry-save").classList.contains("hidden"), true);
  const writes = ui.calls.filter(call => call.method === "PUT").length;
  ui.$("#btn-switch-congregation").click();
  await tick();
  assert.equal(ui.calls.filter(call => call.method === "PUT").length, writes);
  ui.controls.confirm = false;
  ui.$("#btn-reload-state").click();
  assert.match(ui.confirmations.at(-1), /descartadas/);
  assert.equal(ui.$("#txt-week-theme").textContent, "Edição local em conflito");
  const event = new ui.window.Event("beforeunload", { cancelable: true });
  ui.window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test("switching congregation flushes pending edits before loading the next state", async t => {
  const ui = await editor(t, { congregations: [{ id: 1, name: "Primeira" }, { id: 2, name: "Segunda" }] });
  await until(() => ui.$(".picker-item"));
  ui.$(".picker-item").click();
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  ui.edit("#txt-week-theme", "Somente a primeira");
  ui.$("#btn-switch-congregation").click();
  await until(() => !ui.$("#congregation-picker").classList.contains("hidden"));
  ui.$(".picker-item:last-child").click();
  await until(() => ui.$("#current-congregation-name").textContent === "Segunda");
  assert.equal(ui.database.get(1).state.weeksData["2026-11-02"].theme, "Somente a primeira");
  assert.equal(ui.database.get(2).state.weeksData["2026-11-02"].theme, "Leitura");
  assert.equal(ui.$("#txt-week-theme").textContent, "Leitura");
});

test("individual deletion saves first, confirms the name and preserves assignments after reopening", async t => {
  const ui = await editor(t);
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  ui.$("#btn-manage-people").click();
  ui.controls.confirm = false;
  ui.$(".btn-delete").click();
  await until(() => ui.confirmations.length === 1);
  assert.match(ui.confirmations[0], /Pessoa de teste/);
  assert.equal(ui.calls.some(call => call.method === "DELETE"), false);
  ui.controls.confirm = true;
  const weeks = structuredClone(ui.database.get(1).state.weeksData);
  ui.$(".btn-delete").click();
  await until(() => ui.$("#people-count-num").textContent === "0");
  assert.equal(ui.database.get(1).state.participants.length, 0);
  assert.deepEqual(ui.database.get(1).state.weeksData, weeks);
  assert.equal(ui.$("#sel-president").value, "Pessoa de teste");
  ui.$("#btn-close-modal").click();
  ui.$("#btn-switch-congregation").click();
  await until(() => !ui.$("#congregation-picker").classList.contains("hidden"));
  ui.$(".picker-item").click();
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  assert.equal(ui.$("#sel-president").value, "Pessoa de teste");
  assert.equal(ui.database.get(1).state.weeksData["2026-11-02"].selections["sel-president"], "Pessoa de teste");
});

test("a save failure cancels deletion and explicit retry saves retained edits", async t => {
  const ui = await editor(t);
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  ui.controls.failSave = true;
  ui.edit("#txt-week-theme", "Texto retido");
  ui.$("#btn-manage-people").click();
  ui.$(".btn-delete").click();
  await until(() => ui.$("#save-status").textContent === "Falha ao salvar");
  assert.equal(ui.confirmations.length, 0);
  assert.equal(ui.calls.some(call => call.method === "DELETE"), false);
  assert.equal(ui.database.get(1).state.participants.length, 1);
  ui.controls.failSave = false;
  ui.$("#btn-retry-save").click();
  await until(() => ui.$("#save-status").textContent === "Salvo");
  assert.equal(ui.database.get(1).state.weeksData["2026-11-02"].theme, "Texto retido");
});

test("invalid loading blocks the editor and never sends a replacement state", async t => {
  const ui = await editor(t, { initial: {} });
  await until(() => !ui.$("#connection-error").classList.contains("hidden"));
  assert.equal(ui.$("#editor-view").classList.contains("hidden"), true);
  assert.equal(ui.$(".app-container").inert, true);
  assert.equal(ui.calls.some(call => call.method !== "GET"), false);
});

test("only a server-confirmed missing state initializes a new congregation", async t => {
  const ui = await editor(t, { initial: null });
  await until(() => !ui.$("#editor-view").classList.contains("hidden"));
  const write = ui.calls.find(call => call.method === "PUT");
  assert.equal(write.headers["If-Match"], '"0"');
  assert.equal(ui.database.get(1).version, 1);
  assert.deepEqual(ui.database.get(1).state.participants, []);
});

test("connection failure during loading keeps the existing server state untouched", async t => {
  const ui = await editor(t, { loadFailure: true });
  await until(() => !ui.$("#connection-error").classList.contains("hidden"));
  assert.equal(ui.$("#editor-view").classList.contains("hidden"), true);
  assert.equal(ui.calls.some(call => call.method !== "GET"), false);
  assert.deepEqual(ui.database.get(1).state, makeState());
});
