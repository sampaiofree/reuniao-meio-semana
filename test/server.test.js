import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApplication } from "../server.js";

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

async function api(fixture, route, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${fixture.baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
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
      method: "PUT", cookie: userCookie, body: { marker: "centro-only" }
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
