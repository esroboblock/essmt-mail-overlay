// Shared pure validation/transport; executed only by the worker in the extension.
(() => {
  const fail = code => Object.assign(new Error(code), { code });
  const { isNaverMailList, naverContext, validESSMTSerial } = globalThis.ESSMTOverlay;
  const keys = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(key => allowed.includes(key));
  function validateConfig(config) {
    try {
      const url = new URL(config.origin);
      if (url.protocol !== 'https:' || url.origin !== config.origin || url.username || url.password ||
          typeof config.namespace !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$/.test(config.namespace) ||
          (config.naver !== undefined && config.naver !== true) || config.demoNamespace !== 'demo:naver:account-a') throw Error();
      return config;
    } catch { throw fail('NOT_CONFIGURED'); }
  }
  function validSender(sender, extensionId, config, settingsOnly = false) {
    if (sender?.id !== extensionId || !Number.isInteger(sender.tab?.id)) return false;
    try {
      const url = new URL(sender.url);
      if (!config?.naver) return ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(url.origin);
      // Chromium keeps sender.url at the initial document URL after pushState.
      return sender.frameId === 0 && url.origin === 'https://mail.naver.com' &&
        (settingsOnly || isNaverMailList(new URL(sender.tab.url)));
    } catch { return false; }
  }
  async function lookupESSMT(config, message, sender, extensionId, fetcher = fetch) {
    validateConfig(config);
    if (!validSender(sender, extensionId, config)) throw fail('INVALID_SENDER');
    if (!keys(message, ['type', 'context', 'messages']) || message.type !== 'essmt:lookup' ||
        !keys(message.context, ['namespace', 'generation']) || !Number.isSafeInteger(message.context.generation) || message.context.generation < 0 ||
        !Array.isArray(message.messages) || message.messages.length > 100) throw fail('INVALID_REQUEST');
    if (message.context.namespace !== (config.naver ? naverContext : config.demoNamespace)) throw fail('ACCOUNT_NOT_BOUND');
    for (const item of message.messages) {
      if (!keys(item, ['mail_sn', 'folder_sn']) || !validESSMTSerial(item.mail_sn) ||
          !(item.folder_sn == null || ['-1', '0'].includes(item.folder_sn) || validESSMTSerial(item.folder_sn))) throw fail('INVALID_REQUEST');
    }
    let response;
    try {
      response = await fetcher(config.origin + '/api/browser-overlay/email-tags/lookup', {
        method: 'POST', credentials: 'include', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-ESSMT-Overlay': '1' },
        body: JSON.stringify({ namespace: config.namespace, messages: message.messages }),
        signal: AbortSignal.timeout(4500)
      });
    } catch (error) { throw fail(error.name === 'TimeoutError' ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR'); }
    if (!response.ok) throw fail(`HTTP_${response.status}`);
    try {
      const result = await response.json();
      globalThis.ESSMTOverlay.validateResults(result, { namespace: config.namespace }, message.messages);
      return { schema_version: 1, namespace: message.context.namespace, results: result.results };
    } catch { throw fail('INVALID_RESPONSE'); }
  }
  Object.assign(globalThis.ESSMTOverlay, { validateConfig, validSender, lookupESSMT });
})();
