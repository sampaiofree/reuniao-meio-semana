import { validateState } from "./state-validation.js";

export async function readCongregationState(request, congregationId) {
  const payload = await request(`/api/congregations/${congregationId}/state`, { cache: "no-store" });
  if (!payload || !Number.isSafeInteger(payload.version) || payload.version < 0
    || payload.congregation?.id !== congregationId
    || (payload.state === null ? payload.version !== 0 : payload.version === 0 || validateState(payload.state, { legacy: true }))) {
    throw new Error("O servidor retornou dados inválidos. A edição foi bloqueada para proteger os registros.");
  }
  return payload;
}

// Each session owns its congregation, version, snapshots and queue. Never reads global editor state.
export function createPersistenceSession({ congregationId, version, request, onStatus = () => {}, onError = () => {}, delay = 350 }) {
  let currentVersion = version;
  let timer = null;
  let pending = null;
  let chain = Promise.resolve();
  let failure = null;
  let outstanding = 0;
  let closed = false;
  let lastSaved = null;

  const status = () => {
    if (!closed) onStatus(failure ? "error" : pending ? "pending" : outstanding ? "saving" : "saved", failure);
  };
  const fail = error => {
    failure = error;
    if (timer) clearTimeout(timer);
    timer = null;
    status();
    if (!closed) onError(error);
  };
  const validateResponse = (payload, expected) => {
    if (payload?.version !== expected + 1) throw new Error("Resposta de salvamento inválida. Recarregue a página antes de continuar.");
  };
  const enqueue = snapshot => {
    outstanding++;
    status();
    chain = chain.then(async () => {
      if (failure || closed) return;
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSaved) return;
      const result = await request(`/api/congregations/${congregationId}/state`, {
        method: "PUT",
        headers: { "If-Match": `"${currentVersion}"` },
        body: serialized
      });
      validateResponse(result, currentVersion);
      currentVersion = result.version;
      lastSaved = serialized;
    }).catch(fail).finally(() => { outstanding--; status(); });
    return chain;
  };
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending && !failure && !closed) {
      const snapshot = pending;
      pending = null;
      enqueue(snapshot);
    }
    await chain;
    return !failure && !closed;
  };

  return {
    get error() { return failure; },
    get version() { return currentVersion; },
    get hasUnsavedChanges() { return Boolean(failure || pending || outstanding); },
    schedule(state) {
      if (closed) return;
      // Capture at the edit, not at the end of the debounce or during a later congregation switch.
      pending = structuredClone(state);
      if (timer) clearTimeout(timer);
      timer = null;
      status();
      if (!failure) timer = setTimeout(() => { timer = null; void flush(); }, delay);
    },
    async saveNow(state) {
      this.schedule(state);
      return flush();
    },
    flush,
    async retry(state) {
      if (closed || [409, 428].includes(failure?.status)) return false;
      await chain;
      failure = null;
      return this.saveNow(state);
    },
    async deleteParticipant(participantId) {
      if (!await flush()) return null;
      let result = null;
      outstanding++;
      status();
      chain = chain.then(async () => {
        if (failure || closed) return;
        const payload = await request(`/api/congregations/${congregationId}/participants/${encodeURIComponent(participantId)}`, {
          method: "DELETE",
          headers: { "If-Match": `"${currentVersion}"` }
        });
        validateResponse(payload, currentVersion);
        if (validateState(payload.state, { legacy: true })) throw new Error("Resposta de exclusão inválida. Recarregue a página.");
        currentVersion = payload.version;
        lastSaved = JSON.stringify(payload.state);
        result = payload.state;
      }).catch(fail).finally(() => { outstanding--; status(); });
      await chain;
      return result;
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    }
  };
}
