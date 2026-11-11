export const inbox = 'https://mail.naver.com/v2/folders/0';
export const allMail = 'https://mail.naver.com/v2/folders/-1';
export const blockRealNaver = '--host-resolver-rules=MAP mail.naver.com ~NOTFOUND';
const rows = ['101', '102', '103', '104', '2147483648'].map(sn =>
  `<li class="mail_item mail-${sn}" data-row="${sn}"><input type="checkbox" aria-label="Select ${sn}"><div class="mail_title"><a class="mail_title_link" href="/v2/popup/read/0/${sn}">Synthetic title</a></div></li>`
).join('');

export function mountNaverFixture(context) {
  return context.route('https://mail.naver.com/**', route => {
    const isAllMail = new URL(route.request().url()).pathname === '/v2/folders/-1';
    const list = isAllMail ? rows.replace('/v2/popup/read/0/101', '/v2/popup/read/42/101') : rows;
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><ul class="mail_list">${list}</ul>` });
  });
}

export function refreshNaverFixture(page) {
  return page.evaluate(() => history.replaceState({}, '', '?refresh=' + Math.random()));
}
