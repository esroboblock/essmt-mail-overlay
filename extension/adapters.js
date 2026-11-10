// Isolated-world adapters. The Naver Mock provider keeps IDs in memory.
(() => {
  function isNaverInbox(location) {
    return location.origin === 'https://mail.naver.com' && location.pathname === '/v2/folders/0/all' && !location.hash;
  }
  function createLocalMock({ delayMs = 250 } = {}) {
    // Pure synthetic mapping, computed per batch; no account IDs or retained cache.
    return (_context, messages, { signal } = {}) => new Promise((resolve, reject) => {
      let timer;
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Request cancelled', 'AbortError')); };
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve(new Map(messages.map(({ mail_sn }) => {
          const kind = Number(mail_sn.slice(-1)) % 3;
          return [mail_sn, { status: kind === 0 ? 'unmatched' : 'matched',
            tags: kind === 1 ? [{ id: 'synthetic', name: 'Mock · 합성 태그' }] : [] }];
        })));
      }, delayMs);
    });
  }
  Object.assign(globalThis.ESSMTOverlay, { isNaverInbox, createLocalMock, naverContext: 'synthetic:naver' });
})();
