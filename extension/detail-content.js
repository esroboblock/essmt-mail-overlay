(() => {
  const { detailRoute, fixtureOrigin, naverOrigin, isNaverMailList } = globalThis.ESSMTOverlay;
  const fixture = location.origin === fixtureOrigin;
  const origin = fixture ? fixtureOrigin : naverOrigin;
  if (location.origin !== origin) return;

  let enabled = false;
  let seenList = isNaverMailList(location);
  let route = location.href;
  let lastBody = null;
  let lastBodyRoute = null;
  let uncertainBody = false;
  let view;
  let account;
  let settingsEpoch = 0;
  let leaving = false;

  function readAccount() {
    const nodes = document.querySelectorAll('#gnb_name1');
    const text = nodes[0]?.textContent.trim();
    return nodes.length === 1 && text ? { node: nodes[0], text } : null;
  }

  function reset() {
    if (!view) return;
    const old = view;
    view = null;
    old.pending = null;
    old.host.remove();
    void chrome.runtime.sendMessage({
      type: 'essmt:detail', operation: 'invalidate', generation: old.generation
    }).catch(() => {});
  }

  function scan(records = []) {
    if (account) {
      const next = readAccount();
      if (next?.node !== account.node || next?.text !== account.text || records.some(record =>
        account.node.contains(record.target) ||
        (record.type === 'attributes' && record.oldValue === 'gnb_name1') ||
        [...record.removedNodes].some(node => node.contains(account.node)))) {
        account = null;
        reset();
      }
    }
    if (route !== location.href) {
      route = location.href;
      uncertainBody = false;
      reset();
    }
    seenList ||= isNaverMailList(location);
    const target = detailRoute(location, origin);
    if (!enabled || leaving || !target || (!fixture && (!seenList || target.folder_sn !== '-1'))) {
      reset();
      if (!target) {
        account = null;
        const residual = document.querySelector('.contents_area.is_read');
        if (residual) { lastBody = residual; lastBodyRoute = location.href; }
      }
      return;
    }
    const toolbars = document.querySelectorAll('.mail_toolbar.type_read');
    const bodies = document.querySelectorAll('.contents_area.is_read');
    const [toolbar] = toolbars;
    const [body] = bodies;
    if (!fixture && lastBodyRoute === route && (
      body !== lastBody || records.some(record => lastBody.contains(record.target))
    )) uncertainBody = true;
    if (uncertainBody) {
      if (body) lastBody = body;
      reset();
      return;
    }
    const bodyChanged = view && records.some(record =>
      (record.target === view.body && ['class', 'data-fixture-mail-sn', 'data-fixture-ready'].includes(record.attributeName)) ||
      [...record.removedNodes].some(node => node.contains(view.body) || node.contains(view.toolbar) || node.contains(view.host)));
    const isNewScreen = lastBody !== body || lastBodyRoute === route;
    const ready = isNewScreen && toolbars.length === 1 && bodies.length === 1 && toolbar.parentElement === body.parentElement &&
      (!fixture || (body.dataset.fixtureReady === 'true' && body.dataset.fixtureMailSn === target.mail_sn));
    if (view && (!ready || bodyChanged || body !== view.body || toolbar !== view.toolbar ||
        view.host.previousElementSibling !== toolbar)) reset();
    if (!ready || view) return;
    lastBody = body;
    lastBodyRoute = route;
    mount(target, toolbar, body);
  }

  const observer = new MutationObserver(scan);
  observer.observe(document, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['id', 'class', 'data-fixture-mail-sn', 'data-fixture-ready'], attributeOldValue: true
  });

  function mount(target, toolbar, body) {
    const host = document.createElement('div');
    host.dataset.essmtDetail = '';
    const shadow = host.attachShadow({ mode: 'closed' });
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'ESSMT 공유 태그');
    panel.lang = 'ko';
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      section { padding: 10px 16px; border-block: 1px solid #c6d3ce; background: #f4f8f6;
        color: #152820; font: 14px system-ui, sans-serif; }
      h2 { font-size: 15px; margin: 0 0 6px; }
      p { margin: 6px 0; }
      ul { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; list-style: none; padding: 0; margin: 6px 0; }
      li { display: flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
      label { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 4px 6px 4px 0; }
      input, button { font: inherit; padding: 3px 6px; max-width: 100%; }
      [hidden] { display: none; }
    `;
    function element(name, text, parent = panel) {
      const node = document.createElement(name);
      node.textContent = text;
      parent.append(node);
      return node;
    }
    function button(text, handler, parent = panel) {
      const node = element('button', text, parent);
      node.type = 'button';
      node.addEventListener('click', event => {
        if (!event.isTrusted || node.disabled) return;
        scan(observer.takeRecords());
        if (view === current) handler();
      });
      return node;
    }
    function field(text, parent) {
      const label = element('label', text, parent);
      const input = element('input', '', label);
      input.type = 'text';
      input.maxLength = 256;
      return input;
    }
    element('h2', 'ESSMT 공유 태그');
    const status = element('p', '');
    status.setAttribute('role', 'status');
    const tags = element('ul', '');
    tags.setAttribute('aria-label', '현재 태그');
    const edit = element('div', '');
    edit.hidden = true;
    const query = field('기존 태그 검색', edit);
    const search = button('검색', () => suggestions(query.value), edit);
    const recent = button('최근 사용', () => { query.value = ''; return suggestions(''); }, edit);
    const choices = element('ul', '', edit);
    choices.setAttribute('aria-label', '태그 추천');
    const name = field('새 태그 이름', edit);
    const create = button('생성 및 부착', () => {
      const value = name.value.trim();
      if (value) void change('attach', { name: value });
      else status.textContent = '새 태그 이름을 입력하세요.';
    }, edit);
    for (const [input, action] of [[query, search], [name, create]]) {
      input.addEventListener('keydown', event => {
        if (!event.isTrusted || event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        scan(observer.takeRecords());
        if (view !== current || action.disabled) return;
        if (input === query) void suggestions(query.value);
        else if (name.value.trim()) void change('attach', { name: name.value.trim() });
        else status.textContent = '새 태그 이름을 입력하세요.';
      });
    }
    const confirm = button('이 화면의 네이버 계정과 ESSMT 데이터셋 일치 확인', () => {
      account = readAccount();
      if (account) void refresh();
      else status.textContent = '네이버 표시 이름을 확인하세요.';
    });
    const reload = button('다시 조회', () => refresh());
    reload.hidden = true;
    const current = { ...target, host, toolbar, body, generation: crypto.randomUUID(), pending: null };
    let busy = false;
    let matched = false;
    let hasToken = false;
    let currentTags = [];
    let removals = [];
    const editor = [query, search, recent, name, create];

    function renderTags() {
      tags.replaceChildren();
      removals = [];
      for (const tag of currentTags) {
        const item = element('li', '', tags);
        element('span', tag.name, item);
        if (fixture && matched) removals.push(button(tag.name + ' 해제', () => change('detach', { tag_id: tag.id }), item));
      }
    }

    function controls() {
      confirm.hidden = Boolean(account);
      reload.hidden = !account || busy;
      edit.hidden = !fixture || !matched;
      for (const control of editor) control.disabled = busy;
      create.disabled ||= !hasToken;
      for (const button of removals) button.disabled = busy || !hasToken;
      for (const button of choices.querySelectorAll('button')) button.disabled = busy || !hasToken;
    }

    async function send(operation, input = {}) {
      scan(observer.takeRecords());
      if (view !== current || !account) return null;
      const ticket = crypto.randomUUID();
      current.pending = { operation, ticket };
      try {
        const reply = await chrome.runtime.sendMessage({
          type: 'essmt:detail', operation, input, ticket, generation: current.generation, ...target
        }).catch(() => null);
        scan(observer.takeRecords());
        if (view !== current) return null;
        if (!reply?.ok) throw Object.assign(new Error(), { code: reply?.error ?? 'COMMUNICATION_ERROR' });
        return reply.result;
      } finally { current.pending = null; }
    }

    function errorMessage(code) {
      if (code === 'HTTP_401' || code === 'HTTP_403') {
        account = null;
        currentTags = [];
        matched = false;
        renderTags();
        return 'ESSMT 직원 로그인과 태그 권한을 확인하세요 (' + code + ').';
      }
      return 'ESSMT 태그 요청 실패 (' + code + ').';
    }

    async function refresh(note = '') {
      if (busy) return;
      busy = true;
      matched = false;
      hasToken = false;
      currentTags = [];
      choices.replaceChildren();
      renderTags();
      controls();
      status.textContent = '태그 조회 중…';
      try {
        const result = await send('lookup');
        if (!result) return;
        matched = result.status === 'matched';
        currentTags = result.tags;
        renderTags();
        const message = matched ? (currentTags.length ? '현재 공유 태그' : '공유 태그 없음') :
          result.status === 'ambiguous' ? '동일한 메일 번호가 여러 건입니다.' : 'ESSMT에서 일치하는 메일을 찾지 못했습니다.';
        status.textContent = [note, message, !fixture && '읽기 전용'].filter(Boolean).join(' ');
        if (matched && fixture) await loadSuggestions(query.value, status.textContent);
      } catch (error) { status.textContent = errorMessage(error.code); }
      finally { busy = false; controls(); }
    }

    async function loadSuggestions(value, note = '') {
      hasToken = false;
      choices.replaceChildren();
      const result = await send('suggestions', { query: value });
      if (!result) return;
      hasToken = true;
      for (const tag of result.tags) {
        const item = element('li', '', choices);
        button(tag.name + ' 부착', () => change('attach', { tag_id: tag.id }), item);
      }
      status.textContent = [note, result.tags.length ? '' : '추천 태그 없음'].filter(Boolean).join(' ') || '태그를 선택하세요.';
    }

    async function suggestions(value) {
      if (busy || !matched) return;
      busy = true;
      controls();
      status.textContent = '추천 태그 조회 중…';
      try { await loadSuggestions(value); }
      catch (error) {
        status.textContent = errorMessage(error.code);
        if (['HTTP_404', 'HTTP_409', 'VIEW_CHANGED'].includes(error.code)) {
          busy = false;
          await refresh(status.textContent);
        }
      } finally { busy = false; controls(); }
    }

    async function change(operation, selector) {
      if (busy || !hasToken || !matched) return;
      busy = true;
      hasToken = false;
      controls();
      status.textContent = '태그 변경 중…';
      let note;
      try {
        const result = await send(operation, selector);
        if (!result) return;
        note = result.changed ? '태그를 변경했습니다.' : '태그 변경 사항이 없습니다.';
        name.value = '';
      } catch (error) {
        note = errorMessage(error.code);
        if (!account) {
          choices.replaceChildren();
          status.textContent = note;
          return;
        }
      } finally { busy = false; controls(); }
      await refresh(note);
    }

    view = current;
    shadow.append(style, panel);
    toolbar.after(host);
    controls();
    if (account) void refresh();
    else status.textContent = '현재 네이버 계정과 ESSMT 데이터셋을 확인하세요.';
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'essmt:detail-check') return false;
    scan(observer.takeRecords());
    reply(Boolean(account && view && view.generation === message.generation &&
      view.pending?.ticket === message.ticket && view.pending.operation === message.operation));
    return false;
  });
  function settings() {
    const epoch = ++settingsEpoch;
    chrome.runtime.sendMessage({ type: 'essmt:settings' }).then(result => {
      if (epoch !== settingsEpoch) return;
      enabled = result?.mode === 'essmt' && (!fixture || result.detailFixture === true);
      scan(observer.takeRecords());
    }).catch(() => {});
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.mode) return;
    enabled = false;
    account = null;
    lastBody = null;
    reset();
    settings();
  });
  window.navigation?.addEventListener('currententrychange', () => scan(observer.takeRecords()));
  window.addEventListener('popstate', () => scan(observer.takeRecords()));
  window.addEventListener('pagehide', () => { leaving = true; account = null; lastBody = null; reset(); });
  window.addEventListener('pageshow', () => { leaving = false; scan(observer.takeRecords()); });
  settings();
})();
