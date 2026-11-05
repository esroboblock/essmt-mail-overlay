(() => {
  const failure = code => Object.assign(new Error(code), { code });
  function validateResults(result, context, messages) {
    const invalid = () => { throw failure('INVALID_RESPONSE'); };
    if (result?.schema_version !== 1 || result.namespace !== context.namespace || !Array.isArray(result.results)) invalid();
    const requested = new Set(messages.map(m => m.mail_sn));
    const results = new Map();
    for (const item of result.results) {
      if (!item || !requested.has(item.mail_sn) || results.has(item.mail_sn) || !Array.isArray(item.tags)) invalid();
      const counts = { matched: n => n === 1, unmatched: n => n === 0, ambiguous: n => Number.isInteger(n) && n >= 2 };
      if (!Object.hasOwn(counts, item.status) || !counts[item.status](item.candidate_count)) invalid();
      if (item.status !== 'matched' && item.tags.length) invalid();
      const tagIds = new Set();
      for (const tag of item.tags) {
        if (!tag || typeof tag.id !== 'string' || !tag.id || typeof tag.name !== 'string' || !tag.name.trim() || tagIds.has(tag.id)) invalid();
        tagIds.add(tag.id);
      }
      results.set(item.mail_sn, item);
    }
    if (results.size !== requested.size) invalid();
    return results;
  }
  function requestTags(target, context, messages, { signal, timeoutMs = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const origin = target.location.origin;
      let timer;
      const finish = (error, result) => {
        clearTimeout(timer);
        target.removeEventListener('message', listener);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(result);
      };
      const abort = () => finish(new DOMException('Request cancelled', 'AbortError'));
      const listener = event => {
        const reply = event.data;
        if (event.source !== target || event.origin !== origin || reply?.channel !== 'essmt-demo:response' || reply.version !== 1 || reply.id !== id) return;
        try {
          if (reply.context?.namespace !== context.namespace || reply.context?.generation !== context.generation) throw failure('STALE_CONTEXT');
          if (reply.ok === false) throw failure(typeof reply.error?.code === 'string' ? reply.error.code : 'INVALID_RESPONSE');
          if (reply.ok !== true) throw failure('INVALID_RESPONSE');
          finish(null, validateResults(reply.result, context, messages));
        } catch (error) { finish(error); }
      };
      if (signal?.aborted) { abort(); return; }
      target.addEventListener('message', listener);
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(failure('BRIDGE_TIMEOUT')), timeoutMs);
      try {
        target.postMessage({ channel: 'essmt-demo:request', version: 1, id, method: 'lookupTags', payload: { namespace: context.namespace, messages } }, origin);
      } catch { finish(failure('COMMUNICATION_ERROR')); }
    });
  }
  Object.assign(globalThis.ESSMTOverlay, { validateResults, requestTags });
})();
