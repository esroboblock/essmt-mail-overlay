importScripts('identity.js', 'bridge.js', 'adapters.js', 'worker-core.js', 'config.js');
const { validSender, lookupESSMT } = globalThis.ESSMTOverlay;
const config = globalThis.ESSMT_CONFIG;
const pendingConfirmations = new Map();
const bindingKey = tabId => `naverDocument:${tabId}`;
if (config?.naver) chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.storage.session.remove(bindingKey(tabId));
});

async function confirmInbox(sender) {
  const tabs = await chrome.tabs.query({ windowId: sender.tab.windowId });
  const inboxes = (await Promise.all(tabs.map(async ({ id }) => {
    const documentId = await chrome.tabs.sendMessage(id, { type: 'essmt:inbox-status' }, { frameId: 0 }).catch(() => null);
    return typeof documentId === 'string' ? { tabId: id, documentId } : null;
  }))).filter(Boolean);
  if (inboxes.length !== 1) return { ok: false };
  const [{ tabId, documentId }] = inboxes;
  if (pendingConfirmations.has(tabId)) return { ok: false };
  pendingConfirmations.set(tabId, documentId);
  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, { type: 'essmt:confirm-inbox' }, { documentId });
    return result;
  } finally {
    try {
      if (!result?.ok) await chrome.storage.session.remove(bindingKey(tabId));
    } finally {
      pendingConfirmations.delete(tabId);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const type = message?.type;
  if (config?.naver && type === 'essmt:confirm-inbox' && sender.id === chrome.runtime.id &&
      sender.url === chrome.runtime.getURL('options.html') && Number.isInteger(sender.tab?.windowId)) {
    confirmInbox(sender).then(reply, () => reply({ ok: false }));
    return true;
  }
  if (!['essmt:settings', 'essmt:lookup', 'essmt:inbox-document', 'essmt:confirm-document'].includes(type)) return false;
  if (!validSender(sender, chrome.runtime.id, config, type === 'essmt:settings')) return false;
  void (async () => {
    try {
      const { mode = 'mock' } = await chrome.storage.local.get('mode');
      if (type === 'essmt:settings') return { ok: true, mode: mode === 'essmt' ? 'essmt' : 'mock' };
      if (mode !== 'essmt') return { ok: false, error: { code: 'MODE_CHANGED' } };
      if (type === 'essmt:inbox-document') return config?.naver ? sender.documentId : null;
      if (type === 'essmt:confirm-document') {
        if (!config?.naver || !sender.documentId || pendingConfirmations.get(sender.tab.id) !== sender.documentId) return { ok: false };
        await chrome.storage.session.set({ [bindingKey(sender.tab.id)]: { documentId: sender.documentId } });
        return { ok: true };
      }
      if (config?.naver) {
        const key = bindingKey(sender.tab.id);
        const { [key]: binding } = await chrome.storage.session.get(key);
        if (!sender.documentId || binding?.documentId !== sender.documentId) return { ok: false, error: { code: 'ACCOUNT_NOT_BOUND' } };
      }
      const result = await lookupESSMT(config, message, sender, chrome.runtime.id);
      const current = await chrome.storage.local.get('mode');
      if (current.mode !== 'essmt') return { ok: false, error: { code: 'MODE_CHANGED' } };
      return { ok: true, result };
    } catch (error) { return { ok: false, error: { code: error.code ?? 'COMMUNICATION_ERROR' } }; }
  })().then(reply);
  return true;
});
