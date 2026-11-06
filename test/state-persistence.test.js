import assert from "node:assert/strict";
import test from "node:test";
import { createPersistenceSession, readCongregationState } from "../state-persistence.js";
import { makeState } from "./support/state-fixture.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("captures the edited snapshot and isolates congregation queues and versions", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, ...options });
    return { version: Number(options.headers["If-Match"].replaceAll('"', "")) + 1 };
  };
  const first = createPersistenceSession({ congregationId: 1, version: 4, request, delay: 60000 });
  const second = createPersistenceSession({ congregationId: 2, version: 8, request, delay: 60000 });
  const state = makeState();
  first.schedule(state);
  state.participants = [];
  second.schedule(state);
  await Promise.all([first.flush(), second.flush()]);
  assert.equal(JSON.parse(calls.find(call => call.url.includes("/1/")).body).participants.length, 1);
  assert.equal(JSON.parse(calls.find(call => call.url.includes("/2/")).body).participants.length, 0);
  assert.equal(first.version, 5);
  assert.equal(second.version, 9);
  first.close();
  second.close();
});

test("serializes edits made while saving and uses the newly acknowledged version", async () => {
  const waiting = deferred();
  const calls = [];
  const statuses = [];
  const session = createPersistenceSession({
    congregationId: 1, version: 1, delay: 60000,
    onStatus: status => statuses.push(status),
    request: async (url, options) => {
      calls.push(options);
      return calls.length === 1 ? waiting.promise : { version: 3 };
    }
  });
  const state = makeState();
  const firstSave = session.saveNow(state);
  await Promise.resolve();
  state.weekText = "Outra edição";
  session.schedule(state);
  const secondSave = session.flush();
  assert.equal(calls.length, 1);
  waiting.resolve({ version: 2 });
  assert.equal(await firstSave, true);
  assert.equal(await secondSave, true);
  assert.deepEqual(calls.map(call => call.headers["If-Match"]), ['"1"', '"2"']);
  assert.equal(JSON.parse(calls[0].body).weekText, "02 a 08 de novembro");
  assert.equal(JSON.parse(calls[1].body).weekText, "Outra edição");
  assert.ok(statuses.includes("pending"));
  assert.ok(statuses.includes("saving"));
  assert.equal(statuses.at(-1), "saved");
  assert.equal(session.hasUnsavedChanges, false);
  session.close();
});

test("a conflict halts queued saves and deletion without discarding local edits or adopting a new version", async () => {
  const waiting = deferred();
  const calls = [];
  const statuses = [];
  const session = createPersistenceSession({
    congregationId: 2, version: 5, delay: 60000,
    onStatus: status => statuses.push(status),
    request: async (url, options) => { calls.push({ url, options }); return waiting.promise; }
  });
  const state = makeState();
  const first = session.saveNow(state);
  await Promise.resolve();
  state.weekText = "Edição local preservada";
  session.schedule(state);
  const queued = session.flush();
  waiting.reject(Object.assign(new Error("Conflito"), { status: 409 }));
  assert.equal(await first, false);
  assert.equal(await queued, false);
  assert.equal(await session.retry(state), false);
  assert.equal(await session.deleteParticipant("1"), null);
  session.schedule(state);
  assert.equal(await session.flush(), false);
  assert.equal(calls.length, 1);
  assert.equal(session.version, 5);
  assert.equal(state.weekText, "Edição local preservada");
  assert.equal(session.hasUnsavedChanges, true);
  assert.equal(statuses.at(-1), "error");
  session.close();
});

test("connection failures stop automatic saves; an explicit retry can save the latest edits", async () => {
  let calls = 0;
  const session = createPersistenceSession({
    congregationId: 1, version: 2, delay: 60000,
    request: async () => {
      if (++calls === 1) throw new Error("Sem conexão");
      return { version: 3 };
    }
  });
  const state = makeState();
  assert.equal(await session.saveNow(state), false);
  assert.equal(await session.deleteParticipant("1"), null);
  state.weekText = "Edição após falha";
  session.schedule(state);
  assert.equal(await session.flush(), false);
  assert.equal(calls, 1);
  assert.equal(await session.retry(state), true);
  assert.equal(calls, 2);
  assert.equal(session.version, 3);
  session.close();
});

test("a lost save response cannot force an overwrite on retry", async () => {
  let calls = 0;
  const versions = [];
  const session = createPersistenceSession({
    congregationId: 1, version: 2, delay: 60000,
    request: async (url, options) => {
      versions.push(options.headers["If-Match"]);
      if (++calls === 1) throw new Error("Resposta perdida após gravar");
      throw Object.assign(new Error("Conflito"), { status: 409 });
    }
  });
  assert.equal(await session.saveNow(makeState()), false);
  assert.equal(await session.retry(makeState()), false);
  assert.deepEqual(versions, ['"2"', '"2"']);
  assert.equal(session.version, 2);
  assert.equal(await session.retry(makeState()), false);
  session.close();
});

test("deletion flushes pending edits and keeps returned schedules intact", async () => {
  const calls = [];
  const state = makeState();
  const deletedState = { ...state, participants: [] };
  const session = createPersistenceSession({
    congregationId: 1, version: 1, delay: 60000,
    request: async (url, options) => {
      calls.push({ url, options });
      return options.method === "PUT" ? { version: 2 } : { version: 3, state: deletedState };
    }
  });
  session.schedule(state);
  const result = await session.deleteParticipant("1");
  assert.deepEqual(calls.map(call => call.options.method), ["PUT", "DELETE"]);
  assert.deepEqual(calls.map(call => call.options.headers["If-Match"]), ['"1"', '"2"']);
  assert.deepEqual(result.weeksData, state.weeksData);
  assert.deepEqual(result.participants, []);
  assert.equal(session.version, 3);
  session.close();
});

test("loading errors and invalid responses never initialize or save an empty state", async () => {
  const calls = [];
  const payloads = [
    {}, { state: {}, version: 1, congregation: { id: 1 } },
    { state: null, version: 1, congregation: { id: 1 } },
    { state: makeState(), version: 0, congregation: { id: 1 } },
    { state: makeState(), version: 1, congregation: { id: 2 } }
  ];
  for (const payload of payloads) {
    await assert.rejects(readCongregationState(async (url, options) => {
      calls.push(options);
      return payload;
    }, 1), /inválidos/);
  }
  await assert.rejects(readCongregationState(async () => { throw new Error("Sem conexão"); }, 1), /Sem conexão/);
  assert.ok(calls.every(options => !options.method && options.cache === "no-store"));
  assert.equal((await readCongregationState(async () => ({ state: null, version: 0, congregation: { id: 1 } }), 1)).state, null);
  assert.deepEqual((await readCongregationState(async () => ({ state: makeState(), version: 3, congregation: { id: 1 } }), 1)).state, makeState());
});

test("invalid acknowledgement blocks subsequent writes and closing cancels pending work", async () => {
  let calls = 0;
  const session = createPersistenceSession({ congregationId: 1, version: 3, delay: 60000, request: async () => { calls++; return {}; } });
  assert.equal(await session.saveNow(makeState()), false);
  assert.equal(session.version, 3);
  assert.equal(await session.saveNow(makeState()), false);
  assert.equal(calls, 1);
  session.close();
  const pending = createPersistenceSession({ congregationId: 2, version: 0, request: async () => { calls++; } });
  pending.schedule(makeState());
  pending.close();
  assert.equal(await pending.flush(), false);
  assert.equal(calls, 1);
});
