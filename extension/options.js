const select = document.querySelector('#mode');
const status = document.querySelector('#status');
const confirmInbox = document.querySelector('#confirm-inbox');
select.querySelector('[value="essmt"]').disabled = !globalThis.ESSMT_CONFIG;
chrome.storage.local.get('mode').then(({ mode }) => { select.value = mode === 'essmt' ? 'essmt' : 'mock'; });
if (!globalThis.ESSMT_CONFIG) status.textContent = '현재 확장은 Mock 전용입니다. 연결 설정을 넣어 로컬 확장을 생성하세요.';
if (globalThis.ESSMT_CONFIG?.naver) {
  document.querySelector('#binding-help').textContent =
    '이 창에 받은메일함 또는 전체메일 탭을 하나만 열고 네이버 계정과 ESSMT 데이터셋이 일치할 때만 확인하세요. 표시 이름이 바뀌거나 사라지면 조회가 중단됩니다. 계정을 바꾼 뒤에는 표시 이름이 같아도 다시 확인하세요.';
  confirmInbox.hidden = false;
  confirmInbox.addEventListener('click', async () => {
    if (select.value !== 'essmt') {
      status.textContent = '먼저 ESSMT 모드를 선택하세요.';
      return;
    }
    confirmInbox.disabled = true;
    status.textContent = '현재 메일 목록을 확인하는 중입니다.';
    const result = await chrome.runtime.sendMessage({ type: 'essmt:confirm-inbox' }).catch(() => null);
    status.textContent = result?.ok ? '현재 메일 목록의 연결을 확인했습니다.' : '이 창에 받은메일함 또는 전체메일 탭을 하나만 열고 네이버 표시 이름이 보이는지 확인한 뒤 다시 시도하세요.';
    confirmInbox.disabled = false;
  });
}
select.addEventListener('change', async () => {
  await chrome.storage.local.set({ mode: select.value });
  status.textContent = globalThis.ESSMT_CONFIG?.naver
    ? '저장했습니다. ESSMT 조회를 시작하려면 현재 메일 목록을 확인하세요.'
    : '저장했습니다. 열린 데모에서 적용됩니다.';
});
