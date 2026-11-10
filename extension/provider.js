(() => {
  async function requestESSMT(target, context, messages, { signal } = {}) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    return new Promise((resolve, reject) => {
      let done = false;
      const abort = () => finish(new DOMException('Request cancelled', 'AbortError'));
      const finish = (error, value) => {
        if (done) return;
        done = true; signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(value);
      };
      signal?.addEventListener('abort', abort, { once: true });
      chrome.runtime.sendMessage({ type: 'essmt:lookup', context, messages }).then(reply => {
        try {
          if (reply?.ok !== true) throw Object.assign(new Error('Lookup failed'), { code: reply?.error?.code ?? 'COMMUNICATION_ERROR' });
          finish(null, globalThis.ESSMTOverlay.validateResults(reply.result, context, messages));
        } catch (error) { finish(error); }
      }, () => finish(Object.assign(new Error('Worker unavailable'), { code: 'COMMUNICATION_ERROR' })));
    });
  }
  Object.assign(globalThis.ESSMTOverlay, { requestESSMT });
})();
