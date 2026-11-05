import { MockError } from './mock-api.js';

// Same-window, same-origin protocol for isolated extension content scripts.
// This is a public demo interface, never an authentication/security boundary.
export function installBridge({ api, getContext, getLookupOptions }) {
  const pending = new Set();
  window.addEventListener('essmt-demo:contextchange', () => {
    for (const controller of pending) controller.abort();
  });
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.channel !== 'essmt-demo:request') return;
    if (typeof message.id !== 'string' || !message.id.length || message.id.length > 100) return;
    const context = getContext();
    const controller = new AbortController();
    const envelope = { channel: 'essmt-demo:response', version: 1, id: message.id, context };
    try {
      if (message.version !== 1 || !['getContext', 'listMails', 'lookupTags'].includes(message.method)) {
        throw new MockError('INVALID_REQUEST', 400, '지원하지 않는 버전 또는 method');
      }
      if (!context.ready) throw new MockError('NOT_READY', 409, '데모 화면 전환 중');
      if (pending.size >= 20) throw new MockError('BUSY', 429, '동시 Mock 요청 최대 20개');
      pending.add(controller);
      let result;
      if (message.method === 'getContext') result = context;
      else if (message.method === 'listMails') result = await api.listMails(message.payload);
      else {
        if (message.payload?.namespace !== context.namespace) throw new MockError('INVALID_REQUEST', 400, '현재 계정 namespace 필요');
        result = await api.lookupTags(message.payload, { ...getLookupOptions(), signal: controller.signal });
      }
      if (getContext().generation !== context.generation) throw new MockError('STALE_CONTEXT', 409, '화면 컨텍스트 변경으로 응답 폐기');
      window.postMessage({ ...envelope, ok: true, result }, location.origin);
    } catch (error) {
      const stale = getContext().generation !== context.generation;
      window.postMessage({ ...envelope, ok: false, error: {
        code: stale ? 'STALE_CONTEXT' : error.code ?? 'INVALID_REQUEST',
        status: stale ? 409 : error.status ?? 400,
        message: stale ? '화면 컨텍스트 변경으로 응답 폐기' : error.message
      } }, location.origin);
    } finally { pending.delete(controller); }
  });
}
