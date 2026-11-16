(() => {
  const { detailRoute, fixtureOrigin, naverOrigin, requestDetail, validDetailInput } = globalThis.ESSMTOverlay;
  const states = new Map();
  const lifetimeMs = 300000;
  const fail = code => Object.assign(new Error(code), { code });

  function installDetailWorker(config) {
    if (!config?.naver && !config?.detailFixture) return;
    const origin = config.detailFixture ? fixtureOrigin : naverOrigin;
    chrome.tabs.onRemoved.addListener(tabId => states.delete(tabId));
    chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
      if (frameId === 0) states.delete(tabId);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.mode) states.clear();
    });

    async function check(sender, message, operation) {
      const frame = await chrome.webNavigation.getFrame({ tabId: sender.tab.id, frameId: 0 });
      const target = frame && detailRoute(new URL(frame.url), origin);
      if (!target || (!config.detailFixture && target.folder_sn !== '-1') || frame.documentId !== sender.documentId || frame.documentLifecycle !== 'active' ||
          target.mail_sn !== message.mail_sn || target.folder_sn !== message.folder_sn) throw fail('VIEW_CHANGED');
      const current = await chrome.tabs.sendMessage(sender.tab.id, {
        type: 'essmt:detail-check', operation, ticket: message.ticket, generation: message.generation
      }, { documentId: sender.documentId });
      if (current !== true) throw fail('VIEW_CHANGED');
      return target;
    }

    async function handle(message, sender) {
      const { operation, ticket, generation, input } = message;
      const tabId = sender.tab.id;
      if (operation === 'invalidate') {
        const state = states.get(tabId);
        if (state?.documentId === sender.documentId && state.generation === generation) states.delete(tabId);
        return {};
      }
      if (typeof ticket !== 'string' || ticket.length !== 36 || typeof generation !== 'string' ||
          generation.length !== 36 || !input || typeof input !== 'object' || Array.isArray(input) ||
          !validDetailInput(operation, input)) throw fail('INVALID_REQUEST');
      if (operation !== 'lookup' && !config.detailFixture) throw fail('EDIT_DISABLED');
      const { mode } = await chrome.storage.local.get('mode');
      if (mode !== 'essmt') throw fail('MODE_CHANGED');

      let state = states.get(tabId);
      if (operation === 'lookup' && (state?.generation !== generation || state.documentId !== sender.documentId)) {
        state = { generation, documentId: sender.documentId };
        states.set(tabId, state);
      }
      if (!state || state.generation !== generation || state.documentId !== sender.documentId) throw fail('VIEW_CHANGED');
      if (state.busy) throw fail('BUSY');
      state.busy = true;
      try {
        if (operation === 'lookup') {
          state.matched = false;
          state.token = null;
        } else if (!state.matched) throw fail('VIEW_CHANGED');

        const mutation = operation === 'attach' || operation === 'detach';
        const issued = state.token;
        state.token = null;
        if (mutation && (!issued || Date.now() - issued.started >= lifetimeMs)) throw fail('TOKEN_EXPIRED');

        const target = await check(sender, message, operation);
        if (states.get(tabId) !== state) throw fail('VIEW_CHANGED');
        const started = Date.now();
        const result = await requestDetail(config, target, operation,
          mutation ? { ...input, target_token: issued.value } : input);
        await check(sender, message, operation);
        if (states.get(tabId) !== state) throw fail('VIEW_CHANGED');
        if (operation === 'lookup') state.matched = result.status === 'matched';
        if (operation === 'suggestions') {
          state.token = { value: result.target_token, started };
          return { tags: result.tags };
        }
        if (mutation) state.matched = false;
        return result;
      } catch (error) {
        state.token = null;
        if (['HTTP_401', 'HTTP_403'].includes(error.code) || operation !== 'suggestions') state.matched = false;
        throw error;
      } finally { state.busy = false; }
    }

    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message?.type !== 'essmt:detail') return false;
      if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.documentId ||
          sender.documentLifecycle !== 'active' || !Number.isInteger(sender.tab?.id) ||
          sender.origin !== origin) return false;
      handle(message, sender).then(result => reply({ ok: true, result }), error => {
        reply({ ok: false, error: error.code ?? 'COMMUNICATION_ERROR' });
      });
      return true;
    });
  }

  globalThis.ESSMTOverlay.installDetailWorker = installDetailWorker;
})();
