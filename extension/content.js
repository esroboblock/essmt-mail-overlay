(() => {
  const { identifyRow, requestTags, requestESSMT } = globalThis.ESSMTOverlay;
  const rows = new Map();
  let mode = null;
  let root = document.querySelector('#demo-root');
  if (!root || !['http://127.0.0.1:4173', 'http://localhost:4173'].includes(location.origin)) return;
  let context = null;
  let controller = null;
  let running = false;
  const options = { subtree: true, childList: true, attributes: true,
    attributeFilter: ['href', 'class', 'data-demo-namespace', 'data-demo-generation', 'data-demo-ready'] };
  const observer = new MutationObserver(records => {
    // A remove/reinsert is a new binding even if the row and its ID survive.
    for (const record of records) for (const node of record.removedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      for (const row of rows.keys()) if (node === row || node.contains(row)) forget(row);
    }
    scan();
  });
  function write(action) {
    observer.disconnect();
    try { action(); } finally { if (root?.isConnected) observer.observe(root, options); }
  }
  function clear(row) {
    row.querySelectorAll('[data-essmt-tags]').forEach(el => el.remove());
    row.removeAttribute('data-essmt-state');
    row.removeAttribute('data-essmt-error');
  }
  function forget(row) { write(() => clear(row)); rows.delete(row); }
  function readContext() {
    if (!mode || !root?.isConnected || root.dataset.demoReady !== 'true') return null;
    const namespace = root.dataset.demoNamespace;
    const generation = Number(root.dataset.demoGeneration);
    if (!['demo:naver:account-a', 'demo:naver:account-b'].includes(namespace) || !Number.isSafeInteger(generation) || generation < 0) return null;
    return { namespace, generation };
  }
  const sameContext = (a, b) => a?.namespace === b?.namespace && a?.generation === b?.generation;
  const sameIdentity = (a, b) => a?.mail_sn === b?.mail_sn && a?.folder_sn === b?.folder_sn;
  function current(row, binding, captured) {
    return row.isConnected && rows.get(row) === binding && sameContext(captured, readContext()) &&
      sameIdentity(binding.identity, identifyRow(row)) && row.closest('#demo-root .mail_list') !== null;
  }
  function paint(row, binding) {
    write(() => {
      clear(row);
      row.dataset.essmtState = binding.status;
      if (binding.error) row.dataset.essmtError = binding.error;
      if (!binding.tags?.length) return;
      const link = row.querySelector('a.mail_title_link');
      // Do not inject into links or interactive mail controls.
      if (!link?.parentElement.matches('.mail_title')) return;
      const container = document.createElement('span');
      container.dataset.essmtTags = '';
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'ESSMT 태그');
      for (const tag of binding.tags) {
        const badge = document.createElement('span');
        badge.className = 'essmt-tag';
        badge.textContent = tag.name;
        badge.title = tag.name;
        container.append(badge);
      }
      link.after(container);
    });
  }
  function scan() {
    const next = readContext();
    if (!sameContext(context, next)) {
      controller?.abort();
      for (const row of rows.keys()) forget(row);
      context = next;
    }
    if (!context) return;
    const visible = new Set(document.querySelectorAll('#demo-root .mail_list .mail_item'));
    for (const row of rows.keys()) if (!visible.has(row)) forget(row);
    for (const row of visible) {
      const identity = identifyRow(row);
      let binding = rows.get(row);
      if (!binding || !sameIdentity(identity, binding.identity)) {
        binding = { identity, status: identity ? 'loading' : 'unidentified', requested: false };
        rows.set(row, binding);
        paint(row, binding);
      } else if (binding.tags?.length) {
        // Same-ID title churn can remove, relocate or clone our container.
        const containers = row.querySelectorAll('[data-essmt-tags]');
        const link = row.querySelector('a.mail_title_link');
        if (containers.length !== 1 || link.nextElementSibling !== containers[0]) paint(row, binding);
      }
    }
    void pump();
  }
  async function pump() {
    if (running || !context) return;
    const pending = [...rows].filter(([, binding]) => binding.identity && !binding.requested);
    if (!pending.length) return;
    const messages = [...new Map(pending.map(([, b]) => [b.identity.mail_sn, b.identity])).values()].slice(0, 100);
    const ids = new Set(messages.map(m => m.mail_sn));
    const batch = pending.filter(([, b]) => ids.has(b.identity.mail_sn));
    for (const [, binding] of batch) binding.requested = true;
    const captured = context;
    const active = new AbortController();
    controller = active;
    running = true;
    try {
      const results = await (mode === 'essmt' ? requestESSMT : requestTags)(window, captured, messages, { signal: active.signal });
      for (const [row, binding] of batch) {
        if (!current(row, binding, captured)) continue;
        const result = results.get(binding.identity.mail_sn);
        binding.tags = result.tags;
        binding.status = result.status === 'matched' && !result.tags.length ? 'no-tags' : result.status;
        paint(row, binding);
      }
    } catch (error) {
      if (error.name !== 'AbortError') for (const [row, binding] of batch) {
        if (!current(row, binding, captured)) continue;
        binding.status = 'error'; binding.error = error.code ?? 'COMMUNICATION_ERROR';
        paint(row, binding);
      }
    } finally {
      if (controller === active) controller = null;
      running = false;
      void pump();
    }
  }
  function invalidate() {
    controller?.abort();
    for (const row of rows.keys()) forget(row);
    context = null;
    scan();
  }
  // No tag cache. Poll only ESSMT; a revoked session is detected on the next lookup.
  setInterval(() => { if (mode === 'essmt') invalidate(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && mode === 'essmt') invalidate(); });
  let settingsRevision = 0;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.mode) return;
    settingsRevision++;
    mode = changes.mode.newValue === 'essmt' ? 'essmt' : 'mock';
    invalidate();
  });
  const revision = settingsRevision;
  chrome.runtime.sendMessage({ type: 'essmt:settings' }).then(reply => {
    if (revision !== settingsRevision) return;
    mode = reply?.mode === 'essmt' ? 'essmt' : 'mock';
    invalidate();
  }).catch(() => { mode = 'mock'; invalidate(); });
  window.addEventListener('essmt-demo:contextchange', scan);
  window.addEventListener('essmt-demo:ready', scan);
  // Watch only the root parent's direct children to rebind after root replacement.
  // All subtree observation remains confined to the active demo root.
  const rootParent = root.parentElement;
  const rootObserver = new MutationObserver(() => {
    const nextRoot = [...rootParent.children].find(child => child.id === 'demo-root') ?? null;
    if (nextRoot === root) return;
    controller?.abort();
    for (const row of rows.keys()) forget(row);
    observer.disconnect();
    root = nextRoot;
    context = null;
    if (root) observer.observe(root, options);
    scan();
  });
  rootObserver.observe(rootParent, { childList: true });
  observer.observe(root, options);
  scan();
})();
