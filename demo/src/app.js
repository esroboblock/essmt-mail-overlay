import { createMockApi } from './mock-api.js';
import { identifyRow } from './identity.js';
import { installBridge } from './bridge.js';

const $ = selector => document.querySelector(selector);
const root = $('#demo-root');
const list = $('.mail_list');
const state = { namespace: 'demo:naver:account-a', folder: 'all', query: '', page: 1, page_size: 10, scenario: 'all', fault: 'normal', generation: 0, ready: false, detail: null, reused: false };
let api;
let diagnostic;
let diagnosticSerial = 0;
const labels = { all: '전체메일', inbox: '받은메일함', sent: '보낸메일함' };
const getContext = () => ({ namespace: state.namespace, generation: state.generation, ready: state.ready,
  folder: state.folder, scenario: state.scenario, page: state.page, query: state.query, view: state.detail ? 'detail' : 'list', fault: state.fault });
const getLookupOptions = () => ({ fault: state.fault });
function emit(name) { window.dispatchEvent(new CustomEvent(name, { detail: getContext() })); }
function invalidate() {
  state.generation++;
  state.ready = false;
  diagnostic?.abort();
  diagnosticSerial++;
  $('#lookup-output').textContent = '';
  $('#lookup-status').textContent = '조회 대기';
  root.dataset.demoGeneration = String(state.generation);
  root.dataset.demoNamespace = state.namespace;
  root.dataset.demoReady = 'false';
  list.dataset.demoNamespace = state.namespace;
  list.dataset.demoGeneration = String(state.generation);
  emit('essmt-demo:contextchange');
  return state.generation;
}
function markReady() {
  state.ready = true;
  root.dataset.demoReady = 'true';
  $('#context').textContent = `${state.namespace} / generation ${state.generation}`;
  emit('essmt-demo:ready');
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function checkbox(className, label, checked = false) {
  const input = element('input', className);
  input.type = 'checkbox'; input.setAttribute('aria-label', label); input.checked = checked;
  return input;
}
function bindRow(row, item) {
  row.className = `mail_item${item.class_mail_sn ? ` mail-${item.class_mail_sn}` : ''}${item.read ? ' read' : ''}`;
  row.dataset.demoRow = item.row_id;
  row.dataset.demoGeneration = String(state.generation);
  row.draggable = false;
  const mail = element('div', 'mail');
  const selection = element('div', 'button_checkbox_wrap');
  selection.append(checkbox('button_checkbox', '메일 선택'));
  const bookmarkWrap = element('div', 'toggle_bookmark_wrap');
  const bookmark = element('button', 'toggle_bookmark', '☆');
  bookmark.setAttribute('aria-label', '중요 메일'); bookmark.setAttribute('aria-pressed', 'false');
  bookmark.addEventListener('click', () => {
    const active = bookmark.getAttribute('aria-pressed') !== 'true';
    bookmark.setAttribute('aria-pressed', String(active)); bookmark.textContent = active ? '★' : '☆';
  });
  bookmarkWrap.append(bookmark);
  const sender = element('div', 'mail_sender');
  const readWrap = element('div', 'toggle_read_wrap');
  const read = checkbox('toggle_read', '읽음', item.read);
  read.addEventListener('change', () => row.classList.toggle('read', read.checked));
  readWrap.append(read);
  const senderButton = element('button', 'button_sender', item.sender);
  senderButton.title = item.sender;
  senderButton.addEventListener('click', () => { $('#search').value = item.sender; $('#search-form').requestSubmit(); });
  sender.append(readWrap, senderButton);
  const inner = element('div', 'mail_inner');
  const title = element('div', 'mail_title');
  const text = element('span', 'text', item.title);
  if (item.link_path) {
    const link = element('a', 'mail_title_link');
    link.setAttribute('href', item.link_path);
    link.append(element('span', 'blind', '메일 보기: '), text);
    title.append(link);
  } else title.append(text);
  inner.append(title);
  const date = element('div', 'mail_date_wrap');
  date.append(element('span', 'mail_date', '합성 메일'));
  mail.append(selection, bookmarkWrap, sender, inner, date);
  // Deliberately retains the li during the reuse scenario; removes the old binding's children.
  row.replaceChildren(mail);
  return row;
}
function showDetail(row) {
  const identity = identifyRow(row);
  if (!identity) { $('#mail-status').textContent = '식별 불가: 링크와 클래스가 일치해야 합니다.'; return; }
  const title = row.querySelector('.text').textContent;
  invalidate();
  state.detail = { ...identity, title };
  list.replaceChildren();
  $('#detail-title').textContent = title;
  $('#detail-identity').textContent = `namespace: ${state.namespace} / folderSN: ${identity.folder_sn} / mailSN: ${identity.mail_sn}`;
  $('#detail').dataset.demoMailSn = identity.mail_sn;
  $('#detail').dataset.demoFolderSn = identity.folder_sn;
  $('#detail').dataset.demoGeneration = String(state.generation);
  $('#list-view').hidden = true;
  $('#detail').hidden = false;
  $('#mail-status').textContent = '합성 상세 화면';
  markReady();
}
async function render({ reuse = false } = {}) {
  const retainedRow = reuse ? list.firstElementChild : null;
  const generation = invalidate();
  list.replaceChildren();
  state.detail = null;
  $('#detail').hidden = true;
  for (const name of ['demoMailSn', 'demoFolderSn', 'demoGeneration']) delete $('#detail').dataset[name];
  $('#list-view').hidden = false;
  $('#mail-status').textContent = '목록 준비 중…';
  $('#folder-title').textContent = labels[state.folder];
  document.querySelectorAll('[data-folder]').forEach(button => {
    if (button.dataset.folder === state.folder) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('#reuse').hidden = state.scenario !== 'reuse';
  $('#thread-note').hidden = state.scenario !== 'thread';
  try {
    // Choose the active binding before filtering, so search and counts describe the displayed mail.
    const scenario = state.scenario === 'reuse' && state.reused ? 'no-tags' : state.scenario;
    const result = await api.listMails({ ...state, scenario });
    if (generation !== state.generation) return;
    state.page = result.page;
    const rows = result.rows;
    for (const item of rows) list.append(bindRow(retainedRow ?? element('li'), item));
    $('#empty').hidden = rows.length > 0;
    $('#total-count').textContent = `총 ${result.total}행 · 합성 데이터`;
    $('#page-count').textContent = `${result.page} / ${result.total_pages}`;
    $('#prev').disabled = result.page <= 1;
    $('#next').disabled = result.page >= result.total_pages;
    $('#mail-status').textContent = `${rows.length}행 표시 · 태그 배지는 확장 소유`;
    markReady();
  } catch (error) {
    if (generation === state.generation) $('#mail-status').textContent = `목록 실패: ${error.message}`;
  }
}
async function lookupCurrent() {
  if (!state.ready) return;
  diagnostic?.abort();
  diagnostic = new AbortController();
  const serial = ++diagnosticSerial;
  const context = getContext();
  const identities = state.detail ? [{ mail_sn: state.detail.mail_sn, folder_sn: state.detail.folder_sn }]
    : [...list.querySelectorAll('.mail_item')].map(identifyRow).filter(Boolean);
  const messages = [...new Map(identities.map(item => [item.mail_sn, item])).values()];
  const unidentified = state.detail ? 0 : list.children.length - identities.length;
  $('#lookup-output').textContent = '';
  $('#lookup-status').textContent = '조회 중…';
  try {
    const response = await api.lookupTags({ namespace: context.namespace, messages }, { ...getLookupOptions(), signal: diagnostic.signal });
    if (serial !== diagnosticSerial || state.generation !== context.generation) return;
    $('#lookup-output').textContent = JSON.stringify(response, null, 2);
    $('#lookup-status').textContent = `완료 · ${messages.length}개 고유 ID / 식별 불가 ${unidentified}행`;
  } catch (error) {
    if (serial !== diagnosticSerial || state.generation !== context.generation || error.name === 'AbortError') return;
    $('#lookup-status').textContent = `조회 실패 · ${error.code}`;
    $('#lookup-output').textContent = JSON.stringify({ code: error.code, status: error.status, message: error.message }, null, 2);
  }
}
function listen() {
  $('#search-form').addEventListener('submit', event => { event.preventDefault(); state.query = $('#search').value; state.page = 1; render(); });
  document.querySelectorAll('[data-folder]').forEach(button => button.addEventListener('click', () => { state.folder = button.dataset.folder; state.page = 1; render(); }));
  $('#scenario').addEventListener('change', event => { state.scenario = event.target.value; state.page = 1; state.reused = false; render(); });
  $('#account').addEventListener('change', event => { state.namespace = event.target.value; state.page = 1; render(); });
  $('#fault').addEventListener('change', event => {
    state.fault = event.target.value;
    // A new fault mode is a new binding lifetime, even though mail rows are unchanged.
    if (state.detail) {
      const detail = state.detail;
      invalidate(); state.detail = detail;
      $('#detail').dataset.demoGeneration = String(state.generation);
      markReady();
    } else render();
  });
  $('#page-size').addEventListener('change', event => { state.page_size = Number(event.target.value); state.page = 1; render(); });
  $('#prev').addEventListener('click', () => { state.page--; render(); });
  $('#next').addEventListener('click', () => { state.page++; render(); });
  $('#refresh').addEventListener('click', () => render());
  $('#back').addEventListener('click', () => render());
  $('#reuse').addEventListener('click', () => { state.reused = !state.reused; render({ reuse: true }); });
  $('#lookup').addEventListener('click', lookupCurrent);
  $('#reset').addEventListener('click', () => {
    Object.assign(state, { namespace: 'demo:naver:account-a', folder: 'all', query: '', page: 1, page_size: 10, scenario: 'all', fault: 'normal', reused: false });
    $('#account').value = state.namespace; $('#scenario').value = 'all'; $('#fault').value = 'normal'; $('#page-size').value = '10'; $('#search').value = '';
    render();
  });
  // Prevent navigation for normal/modified clicks and middle-clicks on synthetic paths.
  const open = event => {
    const link = event.target.closest('a.mail_title_link');
    if (!link) return;
    event.preventDefault();
    if (event.type === 'click') showDetail(link.closest('.mail_item'));
  };
  list.addEventListener('click', open);
  list.addEventListener('auxclick', open);
}
async function start() {
  try {
    const [mails, tags] = await Promise.all(['mails', 'tags'].map(async name => {
      const response = await fetch(new URL(`../fixtures/${name}.json`, import.meta.url));
      if (!response.ok) throw new Error(`fixture ${name}: HTTP ${response.status}`);
      return response.json();
    }));
    api = createMockApi({ mails, tags });
    window.essmtDemo = Object.freeze({ version: 1, api, getContext });
    installBridge({ api, getContext, getLookupOptions });
    listen(); await render();
  } catch (error) {
    $('#mail-status').textContent = `시작 실패: ${error.message}. HTTP 정적 서버로 실행하세요.`;
  }
}
start();
