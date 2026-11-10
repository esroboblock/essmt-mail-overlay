(() => {
  const { identifyRow, requestTags, requestESSMT, isNaverInbox, createLocalMock } = globalThis.ESSMTOverlay;
  const isDemo = ['http://127.0.0.1', 'http://localhost'].includes(location.origin.replace(/:\d+$/, ''));
  const canUseESSMT = isDemo && location.port === '4173' && Boolean(globalThis.chrome?.storage);
  if (!isDemo && location.origin !== 'https://mail.naver.com') return;
  let mode = canUseESSMT ? null : 'mock';
  const rows = new Map();
  const localLookup = createLocalMock();
  let observedRoot = null;
  let rootLifetime = 0;
  const lifecycleObserver = new MutationObserver(records => {
    if (records.some(record => [...record.removedNodes].some(node => node === observedRoot))) rootLifetime++;
    scan();
  });
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
    try { action(); } finally { if (observedRoot?.isConnected) observer.observe(observedRoot, options); }
  }
  function clear(row) {
    row.querySelectorAll('[data-essmt-tags]').forEach(el => el.remove());
    row.removeAttribute('data-essmt-state');
    row.removeAttribute('data-essmt-error');
  }
  function forget(row) { write(() => clear(row)); rows.delete(row); }
  function readContext() {
    if (isNaverInbox(location)) {
      const lists = document.querySelectorAll('.mail_list');
      if (lists.length !== 1) return null;
      return { adapter: 'naver', root: lists[0], namespace: 'synthetic:naver', generation: `${location.href}:${rootLifetime}` };
    }
    if (!isDemo || !mode) return null;
    const root = document.querySelector('#demo-root');
    if (!root || root.dataset.demoReady !== 'true') return null;
    const namespace = root.dataset.demoNamespace;
    const generation = Number(root.dataset.demoGeneration);
    if (!['demo:naver:account-a', 'demo:naver:account-b'].includes(namespace) || !Number.isSafeInteger(generation) || generation < 0) return null;
    return { adapter: 'demo', root, namespace, generation };
  }
  const sameContext = (a, b) => a?.namespace === b?.namespace && a?.generation === b?.generation && a?.root === b?.root;
  const sameIdentity = (a, b) => a?.mail_sn === b?.mail_sn && a?.folder_sn === b?.folder_sn;
  function current(row, binding, captured) {
    return row.isConnected && rows.get(row) === binding && sameContext(captured, readContext()) &&
      sameIdentity(binding.identity, identifyRow(row)) && captured.root.contains(row);
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
      // A host may clone/replace a root before we see it. Remove copied owned
      // output too, including when replacement and route departure coalesce.
      for (const root of document.querySelectorAll('[data-essmt-root]')) {
        root.querySelectorAll('[data-essmt-tags]').forEach(el => el.remove());
        root.querySelectorAll('[data-essmt-state], [data-essmt-error]').forEach(el => {
          el.removeAttribute('data-essmt-state'); el.removeAttribute('data-essmt-error');
        });
        root.removeAttribute('data-essmt-root');
      }
      observer.disconnect();
      lifecycleObserver.disconnect();
      observedRoot = next?.root ?? null;
      if (observedRoot) { observedRoot.dataset.essmtRoot = next.adapter; observer.observe(observedRoot, options); }
      if (observedRoot?.parentElement) lifecycleObserver.observe(observedRoot.parentElement, { childList: true });
      context = next;
    }
    if (!context) return;
    const visible = new Set(context.root.querySelectorAll(context.adapter === 'demo' ? '.mail_list .mail_item' : '.mail_item'));
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
      const { namespace, generation } = captured;
      const requestOptions = { signal: active.signal };
      const results = captured.adapter === 'naver'
        ? await localLookup(captured, messages, requestOptions)
        : await (mode === 'essmt' ? requestESSMT : requestTags)(window, { namespace, generation }, messages, requestOptions);
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
  if (canUseESSMT) {
    function setMode(value) {
      mode = value === 'essmt' ? 'essmt' : 'mock';
      controller?.abort();
      for (const row of rows.keys()) forget(row);
      context = null;
      scan();
    }
    setInterval(() => { if (mode === 'essmt') setMode(mode); }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && mode === 'essmt') setMode(mode);
    });
    let settingsChanged = false;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.mode) return;
      settingsChanged = true;
      setMode(changes.mode.newValue);
    });
    chrome.runtime.sendMessage({ type: 'essmt:settings' }).then(reply => {
      if (!settingsChanged) setMode(reply?.mode);
    }).catch(() => { if (!settingsChanged) setMode('mock'); });
  }
  // Chromium Navigation API observes pushState/replaceState in the page world too.
  window.navigation?.addEventListener('currententrychange', scan);
  window.addEventListener('popstate', scan);
  window.addEventListener('hashchange', scan);
  window.addEventListener('essmt-demo:contextchange', scan);
  window.addEventListener('essmt-demo:ready', scan);
  // Root-scoped observation plus a small lifecycle poll handles SPA route/root replacement
  // without observing or styling unrelated document trees.
  setInterval(() => { if (!sameContext(context, readContext())) scan(); }, 150);
  scan();
})();
