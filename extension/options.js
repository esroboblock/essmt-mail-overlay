const select = document.querySelector('#mode');
const status = document.querySelector('#status');
const confirmInbox = document.querySelector('#confirm-inbox');
select.querySelector('[value="essmt"]').disabled = !globalThis.ESSMT_CONFIG;
chrome.storage.local.get('mode').then(({ mode }) => { select.value = mode === 'essmt' ? 'essmt' : 'mock'; });
if (!globalThis.ESSMT_CONFIG) status.textContent = '현재 확장은 Mock 전용입니다. 연결 설정을 넣어 로컬 확장을 생성하세요.';
if (globalThis.ESSMT_CONFIG?.naver) {
  document.querySelector('#binding-help').textContent =
    '전용 프로필에서 창당 받은메일함 탭을 하나만 열고 네이버 계정과 ESSMT 데이터셋이 일치할 때만 확인하세요. 페이지나 목록이 바뀌면 다시 확인해야 할 수 있습니다.';
  confirmInbox.hidden = false;
  confirmInbox.addEventListener('click', async () => {
    if (select.value !== 'essmt') {
      status.textContent = '먼저 ESSMT 모드를 선택하세요.';
      return;
    }
    confirmInbox.disabled = true;
    status.textContent = '현재 받은메일함을 확인하는 중입니다.';
    const result = await chrome.runtime.sendMessage({ type: 'essmt:confirm-inbox' }).catch(() => null);
    status.textContent = result?.ok ? '현재 받은메일함의 연결을 확인했습니다.' : '이 창에 받은메일함 탭을 하나만 열고 다시 확인하세요.';
    confirmInbox.disabled = false;
  });
}
select.addEventListener('change', async () => {
  await chrome.storage.local.set({ mode: select.value });
  status.textContent = globalThis.ESSMT_CONFIG?.naver
    ? '저장했습니다. ESSMT 조회를 시작하려면 현재 받은메일함을 확인하세요.'
    : '저장했습니다. 열린 데모에서 적용됩니다.';
});
