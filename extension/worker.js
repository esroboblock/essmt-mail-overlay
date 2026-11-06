importScripts('identity.js', 'bridge.js', 'worker-core.js', 'config.js');
const { validSender, lookupESSMT } = globalThis.ESSMTOverlay;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!validSender(sender, chrome.runtime.id)) return false;
  if (!['essmt:settings', 'essmt:lookup'].includes(message?.type)) return false;
  void (async () => {
    try {
      const { mode = 'mock' } = await chrome.storage.local.get('mode');
      if (message.type === 'essmt:settings') return { ok: true, mode: mode === 'essmt' ? 'essmt' : 'mock' };
      if (mode !== 'essmt') return { ok: false, error: { code: 'MODE_CHANGED' } };
      const result = await lookupESSMT(globalThis.ESSMT_CONFIG, message, sender, chrome.runtime.id);
      const current = await chrome.storage.local.get('mode');
      if (current.mode !== 'essmt') return { ok: false, error: { code: 'MODE_CHANGED' } };
      return { ok: true, result };
    } catch (error) { return { ok: false, error: { code: error.code ?? 'COMMUNICATION_ERROR' } }; }
  })().then(reply);
  return true;
});
