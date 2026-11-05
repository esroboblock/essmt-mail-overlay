const SN = /^[1-9]\d*$/;
const FOLDER = /^(0|[1-9]\d*)$/;
export const NAMESPACES = ['demo:naver:account-a', 'demo:naver:account-b'];
export const SCENARIOS = {
  all: null, normal: ['row-101'], 'no-tags': ['row-102'], unmatched: ['row-103'],
  ambiguous: ['row-104'], duplicate: ['row-105-a', 'row-105-b'],
  unidentified: ['row-missing', 'row-malformed', 'row-conflict'],
  'safe-title': ['row-106'], thread: ['row-101', 'row-102'], reuse: ['row-101']
};
const FAULTS = {
  '401': ['UNAUTHORIZED', 401, '모의 인증 필요'],
  '403': ['FORBIDDEN', 403, '모의 접근 권한 없음'],
  '500': ['SERVER_ERROR', 500, '모의 서버 오류'],
  offline: ['OFFLINE', 0, '모의 오프라인'],
  timeout: ['TIMEOUT', 0, '모의 응답 시간 초과']
};
export class MockError extends Error {
  constructor(code, status, message) { super(message); this.name = 'MockError'; this.code = code; this.status = status; }
}
function requireInput(condition, message) {
  if (!condition) throw new MockError('INVALID_REQUEST', 400, message);
}
function validNamespace(namespace) {
  requireInput(NAMESPACES.includes(namespace), '알 수 없는 데모 namespace');
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('취소됨', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('취소됨', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createMockApi({ mails, tags }) {
  // Own the fixture snapshot: neither input nor returned objects can mutate future calls.
  const source = structuredClone(mails);
  const dictionary = new Map(structuredClone(tags.tags).map(tag => [tag.id, tag]));
  const messages = new Map(source.messages.map(message => [message.mail_sn, message]));
  const fallbackTitles = {
    'row-missing': '합성 링크 누락', 'row-malformed': '합성 링크 형식 오류', 'row-conflict': '합성 식별자 충돌'
  };
  return Object.freeze({
    async listMails(options = {}) {
      requireInput(options && typeof options === 'object' && !Array.isArray(options), '목록 요청 객체 필요');
      const { namespace = source.namespace, folder = 'all', query = '', page = 1, page_size = 10, scenario = 'all' } = options;
      validNamespace(namespace);
      requireInput(['all', 'inbox', 'sent'].includes(folder), 'folder는 all/inbox/sent');
      requireInput(Object.hasOwn(SCENARIOS, scenario), '알 수 없는 scenario');
      requireInput(typeof query === 'string' && query.length <= 500, 'query는 500자 이하 문자열');
      requireInput(Number.isInteger(page) && page >= 1 && Number.isInteger(page_size) && page_size >= 1 && page_size <= 100, '유효한 page와 page_size(1~100) 필요');
      const needle = query.trim().toLocaleLowerCase('ko');
      const rows = (namespace === source.namespace ? source.dom_rows : []).map(row => ({
        row_id: row.row_id, link_path: row.link_path, class_mail_sn: row.class_mail_sn,
        title: messages.get(row.expected_mail_sn)?.title ?? fallbackTitles[row.row_id],
        sender: '합성 발신자', read: row.row_id !== 'row-101'
      })).filter(row => {
        const folderSn = row.link_path?.split('/')[4];
        return (folder === 'all' || (folder === 'sent' ? folderSn === '1' : folderSn !== '1'))
          && (!SCENARIOS[scenario] || SCENARIOS[scenario].includes(row.row_id))
          && `${row.title} ${row.sender}`.toLocaleLowerCase('ko').includes(needle);
      });
      const total_pages = Math.max(1, Math.ceil(rows.length / page_size));
      const current = Math.min(page, total_pages);
      await wait(0);
      return { schema_version: 1, namespace, folder, query, scenario, page: current, page_size, total: rows.length,
        total_pages, rows: structuredClone(rows.slice((current - 1) * page_size, current * page_size)) };
    },
    async lookupTags(request, { fault = 'normal', delay_ms = fault === 'slow' ? 1800 : 80, timeout_ms = 1200, signal } = {}) {
      requireInput(request && typeof request === 'object', '요청 객체 필요');
      const { namespace } = request;
      validNamespace(namespace);
      requireInput(Array.isArray(request.messages) && request.messages.length <= 100, 'messages 배열 최대 100개');
      requireInput(Array.from(request.messages).every(item => item && typeof item.mail_sn === 'string' && SN.test(item.mail_sn)
        && typeof item.folder_sn === 'string' && FOLDER.test(item.folder_sn)), 'mail_sn/folder_sn은 정규 숫자 문자열');
      requireInput(['normal', 'slow', ...Object.keys(FAULTS)].includes(fault), '알 수 없는 fault');
      requireInput(Number.isFinite(delay_ms) && delay_ms >= 0 && delay_ms <= 10000
        && Number.isFinite(timeout_ms) && timeout_ms >= 1 && timeout_ms <= 10000, 'delay/timeout 범위 0~10000ms (timeout 최소 1ms)');
      const ids = [...new Set(request.messages.map(item => item.mail_sn))];
      await wait(fault === 'timeout' ? timeout_ms : delay_ms, signal);
      if (Object.hasOwn(FAULTS, fault)) throw new MockError(...FAULTS[fault]);
      const results = ids.map(mail_sn => {
        const match = namespace === source.namespace ? messages.get(mail_sn) : null;
        return { mail_sn, status: match?.status ?? 'unmatched', candidate_count: match?.candidate_count ?? 0,
          tags: match?.status === 'matched' ? match.tag_ids.map(id => dictionary.get(id)) : [] };
      });
      return structuredClone({ schema_version: 1, namespace, results });
    }
  });
}
