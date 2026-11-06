import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApplication } from "../server.js";
import { makePerson, makeState, makeWeek } from "./support/state-fixture.js";

async function createFixture({ legacyState } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "midweek-test-"));
  const dbPath = path.join(directory, "app.sqlite");
  if (legacyState) {
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`CREATE TABLE app_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    legacyDb.prepare("INSERT INTO app_state (id, data, updated_at) VALUES ('main', ?, ?)")
      .run(JSON.stringify(legacyState), "2026-01-02T03:04:05.000Z");
    legacyDb.close();
  }
  const service = createApplication({
    dbPath,
    adminUsername: "admin",
    adminPassword: "admin1234",
    isProduction: false
  });
  const server = await new Promise(resolve => {
    const listening = service.app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  return {
    ...service,
    server,
    directory,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async dispose() {
      await new Promise(resolve => server.close(resolve));
      service.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

async function api(fixture, route, { method = "GET", body, cookie, version } = {}) {
  const response = await fetch(`${fixture.baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(version !== undefined ? { "If-Match": `"${version}"` } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  return {
    status: response.status,
    payload,
    cookie: response.headers.get("set-cookie")?.split(";")[0]
  };
}

async function login(fixture, username, password) {
  return api(fixture, "/api/auth/login", { method: "POST", body: { username, password } });
}

test("migrates the legacy global state to the initial Meaípe congregation", async () => {
  const legacyState = { week: "2026-05-18", participants: [{ id: "x", nome: "Preservado" }], weeksData: {} };
  const fixture = await createFixture({ legacyState });
  try {
    const congregation = fixture.db.prepare("SELECT * FROM congregations WHERE is_initial = 1").get();
    const migrated = fixture.db.prepare("SELECT * FROM congregation_state WHERE congregation_id = ?").get(congregation.id);
    assert.equal(congregation.name, "Meaípe");
    assert.deepEqual(JSON.parse(migrated.data), legacyState);
    assert.ok(fixture.db.prepare("SELECT 1 FROM app_state WHERE id = 'main'").get(), "legacy backup must remain available");
  } finally {
    await fixture.dispose();
  }
});

test("enforces authentication, memberships, soft deletion and password reset", async () => {
  const fixture = await createFixture();
  try {
    const adminPage = await fetch(`${fixture.baseUrl}/admin`);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /id="admin-view"/);
    assert.equal((await login(fixture, "admin", "incorrect")).status, 401);
    const adminLogin = await login(fixture, "ADMIN", "admin1234");
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.cookie;

    const createdUser = await api(fixture, "/api/admin/users", {
      method: "POST", cookie: adminCookie,
      body: { username: "joao", password: "segredo123", congregationIds: [] }
    });
    assert.equal(createdUser.status, 201);
    const userId = createdUser.payload.user.id;

    const centro = await api(fixture, "/api/admin/congregations", {
      method: "POST", cookie: adminCookie,
      body: { name: "Centro", userIds: [userId] }
    });
    assert.equal(centro.status, 201);
    const centroId = centro.payload.congregation.id;

    const userLogin = await login(fixture, "joao", "segredo123");
    assert.equal(userLogin.status, 200);
    assert.deepEqual(userLogin.payload.congregations.map(item => item.id), [centroId]);
    const userCookie = userLogin.cookie;

    const initialId = fixture.db.prepare("SELECT id FROM congregations WHERE is_initial = 1").get().id;
    assert.equal((await api(fixture, `/api/congregations/${initialId}/state`, { cookie: userCookie })).status, 403);
    assert.equal((await api(fixture, `/api/congregations/${centroId}/state`, {
      method: "PUT", cookie: userCookie, version: 0, body: { ...makeState(), marker: "centro-only" }
    })).status, 200);
    assert.equal((await api(fixture, `/api/congregations/${centroId}/state`, { cookie: userCookie })).payload.state.marker, "centro-only");

    const norte = await api(fixture, "/api/admin/congregations", {
      method: "POST", cookie: adminCookie,
      body: { name: "Norte", userIds: [userId] }
    });
    assert.equal(norte.status, 201);
    const refreshedLogin = await login(fixture, "joao", "segredo123");
    assert.equal(refreshedLogin.payload.congregations.length, 2);

    const reset = await api(fixture, `/api/admin/users/${userId}/password`, {
      method: "POST", cookie: adminCookie, body: { password: "novaSenha123" }
    });
    assert.equal(reset.status, 200);
    assert.equal((await api(fixture, "/api/auth/me", { cookie: refreshedLogin.cookie })).status, 401);
    assert.equal((await login(fixture, "joao", "segredo123")).status, 401);
    assert.equal((await login(fixture, "joao", "novaSenha123")).status, 200);

    await api(fixture, `/api/admin/congregations/${centroId}`, {
      method: "PATCH", cookie: adminCookie, body: { active: false }
    });
    assert.equal((await api(fixture, `/api/congregations/${centroId}/state`, { cookie: adminCookie })).status, 404);
    await api(fixture, `/api/admin/congregations/${centroId}`, {
      method: "PATCH", cookie: adminCookie, body: { active: true }
    });
    assert.equal((await api(fixture, `/api/congregations/${centroId}/state`, { cookie: adminCookie })).payload.state.marker, "centro-only");

    const activeUserLogin = await login(fixture, "joao", "novaSenha123");
    await api(fixture, `/api/admin/users/${userId}`, {
      method: "PATCH", cookie: adminCookie, body: { active: false }
    });
    assert.equal((await api(fixture, "/api/auth/me", { cookie: activeUserLogin.cookie })).status, 401);
    assert.equal((await login(fixture, "joao", "novaSenha123")).status, 401);
  } finally {
    await fixture.dispose();
  }
});

test("creates a congregation and its first user atomically", async () => {
  const fixture = await createFixture();
  try {
    const admin = await login(fixture, "admin", "admin1234");
    const result = await api(fixture, "/api/admin/congregations", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        name: "Sul",
        userIds: [],
        newUser: { username: "maria", password: "senhaMaria123" }
      }
    });
    assert.equal(result.status, 201);
    const maria = await login(fixture, "maria", "senhaMaria123");
    assert.equal(maria.status, 200);
    assert.deepEqual(maria.payload.congregations.map(item => item.name), ["Sul"]);
  } finally {
    await fixture.dispose();
  }
});

test("requires a version and rejects stale sessions, including concurrent first saves", async () => {
  const fixture = await createFixture();
  try {
    const { cookie } = await login(fixture, "admin", "admin1234");
    const route = "/api/congregations/1/state";
    const state = makeState();
    const empty = await api(fixture, route, { cookie });
    assert.equal(empty.payload.state, null);
    assert.equal(empty.payload.version, 0);
    assert.equal((await api(fixture, route, { method: "PUT", cookie, body: state })).status, 428);
    for (const header of ['*', '"-1"', '"1.5"', '"9007199254740992"']) {
      const response = await fetch(`${fixture.baseUrl}${route}`, {
        method: "PUT", headers: { cookie, "content-type": "application/json", "If-Match": header }, body: JSON.stringify(state)
      });
      assert.equal(response.status, 400);
    }
    const firstSaves = await Promise.all([
      api(fixture, route, { method: "PUT", cookie, version: 0, body: state }),
      api(fixture, route, { method: "PUT", cookie, version: 0, body: { ...state, weekText: "Outra sessão" } })
    ]);
    assert.deepEqual(firstSaves.map(result => result.status).sort(), [200, 409]);
    const sessionA = await api(fixture, route, { cookie });
    const sessionB = await api(fixture, route, { cookie });
    sessionA.payload.state.weekText = "Alteração da sessão A";
    const saved = await api(fixture, route, { method: "PUT", cookie, version: 1, body: sessionA.payload.state });
    assert.equal(saved.payload.version, 2);
    sessionB.payload.state.participants = [];
    assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 1, body: sessionB.payload.state })).status, 409);
    assert.deepEqual((await api(fixture, route, { cookie })).payload.state, sessionA.payload.state);
    const uncached = await fetch(`${fixture.baseUrl}${route}`, { headers: { cookie } });
    assert.equal(uncached.headers.get("cache-control"), "no-store");
  } finally { await fixture.dispose(); }
});

test("rejects incomplete states, duplicate IDs and removal of people or weeks without changing data", async () => {
  const fixture = await createFixture();
  try {
    const { cookie } = await login(fixture, "admin", "admin1234");
    const route = "/api/congregations/1/state";
    const state = makeState();
    state.participants.push(makePerson("2", "Outra pessoa"));
    state.weeksData["2026-11-09"] = makeWeek();
    assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 0, body: state })).status, 200);
    const invalidStates = [
      {}, { ...state, participants: null }, { ...state, weeksData: [] },
      { ...state, week: "2026-02-30" }, { ...state, startWeek: null },
      { ...state, participants: [state.participants[0], state.participants[0]] },
      { ...state, participants: [{ ...state.participants[0], nome: "" }] },
      { ...state, participants: [{ ...state.participants[0], presidente: "true" }] },
      { ...state, weeksData: { [state.week]: { ...makeWeek(), selections: {} } } },
      { ...state, weeksData: { [state.week]: { ...makeWeek(), ministryParts: [{ id: "x", type: "Discurso" }, { id: "x", type: "Discurso" }] } } }
    ];
    for (const body of invalidStates) {
      assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 1, body })).status, 400);
    }
    for (const body of [
      { ...state, participants: [] },
      { ...state, participants: [state.participants[0]] },
      { ...state, weeksData: { [state.week]: state.weeksData[state.week] } }
    ]) {
      assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 1, body })).status, 422);
    }
    const current = await api(fixture, route, { cookie });
    assert.equal(current.payload.version, 1);
    assert.deepEqual(current.payload.state, state);
  } finally { await fixture.dispose(); }
});

test("allows schedule edits, new weeks and removing an individual part", async () => {
  const fixture = await createFixture();
  try {
    const { cookie } = await login(fixture, "admin", "admin1234");
    const route = "/api/congregations/1/state";
    const state = makeState();
    const week = state.weeksData[state.week];
    week.lifeParts.push({ id: "extra" });
    week.inlineTexts["txt-extra"] = "Parte extra";
    week.times["sel-time-extra"] = "5";
    week.selections["sel-extra"] = "";
    assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 0, body: state })).status, 200);
    week.lifeParts.pop();
    delete week.inlineTexts["txt-extra"];
    delete week.times["sel-time-extra"];
    delete week.selections["sel-extra"];
    week.selections["sel-president"] = "";
    state.weeksData["2026-11-09"] = makeWeek();
    assert.equal((await api(fixture, route, { method: "PUT", cookie, version: 1, body: state })).status, 200);
    assert.deepEqual((await api(fixture, route, { cookie })).payload.state, state);
  } finally { await fixture.dispose(); }
});

test("deletes exactly one person, including the last, preserving all schedules and other congregations", async () => {
  const fixture = await createFixture();
  try {
    const { cookie } = await login(fixture, "admin", "admin1234");
    const state = makeState();
    state.participants.push(makePerson("2", "Outra pessoa"));
    await api(fixture, "/api/congregations/1/state", { method: "PUT", cookie, version: 0, body: state });
    const created = await api(fixture, "/api/admin/congregations", { method: "POST", cookie, body: { name: "Segunda" } });
    const secondRoute = `/api/congregations/${created.payload.congregation.id}/state`;
    await api(fixture, secondRoute, { method: "PUT", cookie, version: 0, body: makeState() });
    const route = "/api/congregations/1/participants/1";
    assert.equal((await api(fixture, route, { method: "DELETE" })).status, 401);
    assert.equal((await api(fixture, route, { method: "DELETE", cookie })).status, 428);
    assert.equal((await api(fixture, route, { method: "DELETE", cookie, version: 0 })).status, 409);
    const result = await api(fixture, route, { method: "DELETE", cookie, version: 1 });
    assert.equal(result.status, 200);
    assert.equal(result.payload.version, 2);
    assert.deepEqual(result.payload.state.participants.map(person => person.id), ["2"]);
    assert.deepEqual(result.payload.state.weeksData, state.weeksData);
    assert.equal((await api(fixture, route, { method: "DELETE", cookie, version: 2 })).status, 404);
    assert.equal((await api(fixture, "/api/congregations/1/participants/2", { method: "DELETE", cookie, version: 2 })).status, 200);
    const final = await api(fixture, "/api/congregations/1/state", { cookie });
    assert.equal(final.payload.version, 3);
    assert.deepEqual(final.payload.state.participants, []);
    assert.deepEqual(final.payload.state.weeksData, state.weeksData);
    assert.deepEqual((await api(fixture, secondRoute, { cookie })).payload.state, makeState());
  } finally { await fixture.dispose(); }
});

test("ordinary users can delete only within their congregation", async () => {
  const fixture = await createFixture();
  try {
    const admin = await login(fixture, "admin", "admin1234");
    await api(fixture, "/api/congregations/1/state", { method: "PUT", cookie: admin.cookie, version: 0, body: makeState() });
    const created = await api(fixture, "/api/admin/congregations", {
      method: "POST", cookie: admin.cookie,
      body: { name: "Acesso limitado", newUser: { username: "pessoa", password: "senha1234" } }
    });
    const id = created.payload.congregation.id;
    await api(fixture, `/api/congregations/${id}/state`, { method: "PUT", cookie: admin.cookie, version: 0, body: makeState() });
    const { cookie } = await login(fixture, "pessoa", "senha1234");
    assert.equal((await api(fixture, "/api/congregations/1/participants/1", { method: "DELETE", cookie, version: 1 })).status, 403);
    assert.equal((await api(fixture, `/api/congregations/${id}/participants/1`, { method: "DELETE", cookie, version: 1 })).status, 200);
    assert.equal((await api(fixture, "/api/congregations/1/state", { cookie: admin.cookie })).payload.state.participants.length, 1);
  } finally { await fixture.dispose(); }
});

test("corrupt stored data cannot be replaced by an automatically initialized state", async () => {
  const fixture = await createFixture();
  try {
    const { cookie } = await login(fixture, "admin", "admin1234");
    fixture.db.prepare("INSERT INTO congregation_state (congregation_id, data, updated_at) VALUES (1, ?, ?)").run("{}", "unchanged");
    assert.equal((await api(fixture, "/api/congregations/1/state", { cookie })).status, 500);
    assert.equal((await api(fixture, "/api/congregations/1/state", { method: "PUT", cookie, version: 1, body: makeState() })).status, 500);
    assert.equal((await api(fixture, "/api/congregations/1/participants/1", { method: "DELETE", cookie, version: 1 })).status, 500);
    assert.deepEqual(fixture.db.prepare("SELECT data, updated_at, version FROM congregation_state WHERE congregation_id = 1").get(), { data: "{}", updated_at: "unchanged", version: 1 });
  } finally { await fixture.dispose(); }
});

test("version migration preserves existing JSON and timestamps and is idempotent", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "midweek-migration-"));
  const options = { dbPath: path.join(directory, "app.sqlite"), adminUsername: "admin", adminPassword: "admin1234" };
  try {
    const original = createApplication(options);
    const data = JSON.stringify(makeState(), null, 2);
    original.db.prepare("INSERT INTO congregation_state (congregation_id, data, updated_at) VALUES (1, ?, ?)").run(data, "2026-01-02T03:04:05.000Z");
    original.db.exec("ALTER TABLE congregation_state DROP COLUMN version; DELETE FROM schema_migrations WHERE version = 2");
    original.close();
    for (let i = 0; i < 2; i++) {
      const migrated = createApplication(options);
      assert.deepEqual(migrated.db.prepare("SELECT data, updated_at, version FROM congregation_state WHERE congregation_id = 1").get(), { data, updated_at: "2026-01-02T03:04:05.000Z", version: i === 0 ? 1 : 7 });
      migrated.db.prepare("UPDATE congregation_state SET version = 7 WHERE congregation_id = 1").run();
      migrated.close();
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
