const select = document.querySelector('#mode');
const status = document.querySelector('#status');
select.querySelector('[value="essmt"]').disabled = !globalThis.ESSMT_CONFIG;
chrome.storage.local.get('mode').then(({ mode }) => { select.value = mode === 'essmt' ? 'essmt' : 'mock'; });
if (!globalThis.ESSMT_CONFIG) status.textContent = '현재 확장은 Mock 전용입니다. 연결 설정을 넣어 로컬 확장을 생성하세요.';
select.addEventListener('change', async () => {
  await chrome.storage.local.set({ mode: select.value });
  status.textContent = '저장했습니다. 열린 데모에서 적용됩니다.';
});
