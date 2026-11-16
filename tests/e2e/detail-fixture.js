export const fixtureOrigin = 'http://localhost:4173';
export const detailURL = (sn, origin = fixtureOrigin) => origin + '/v2/read/-1/' + sn;

export async function routeDetail(context, origin = fixtureOrigin) {
  await context.route(origin + '/v2/**', route => {
    const url = new URL(route.request().url());
    const sn = /^\/v2\/read\/-1\/(\d+)$/.exec(url.pathname)?.[1];
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><span id="gnb_name1">Synthetic account</span><main>
      ${sn ? `<div class="mail_toolbar type_read"><button id="next">다음</button></div>
      <article class="contents_area is_read" data-fixture-ready="true" data-fixture-mail-sn="${sn}">Synthetic mail</article>`
        : '<div class="mail_list"></div>'}</main>`
    });
  });
}

// Playwright locators cannot pierce a closed root. CDP reads the browser's
// flattened accessibility tree while Playwright sends real input to the tab.
export async function detailUI(context, page) {
  const cdp = await context.newCDPSession(page);
  async function find(role, name) {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    return nodes.find(node => !node.ignored && node.role?.value === role &&
      (typeof name === 'string' ? node.name?.value === name : name.test(node.name?.value ?? '')));
  }
  async function click(role, name) {
    const node = await find(role, name);
    if (!node || node.properties?.some(property => property.name === 'disabled' && property.value.value)) {
      throw Error('Control unavailable: ' + name);
    }
    const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId: node.backendDOMNodeId });
    const [x0, y0, , , x1, y1] = model.content;
    await page.mouse.click((x0 + x1) / 2, (y0 + y1) / 2);
  }
  return {
    find,
    async enabled(name) {
      const node = await find('button', name);
      return Boolean(node && !node.properties?.some(property => property.name === 'disabled' && property.value.value));
    },
    click: name => click('button', name),
    async fill(name, value, submit = false) {
      await click('textbox', name);
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(value);
      if (submit) await page.keyboard.press('Enter');
    }
  };
}

export function go(page, sn, render = true) {
  return page.evaluate(({ sn, render }) => {
    if (sn !== null) history.pushState({}, '', '/v2/read/-1/' + sn);
    if (!render) return;
    const body = document.querySelector('article');
    const replacement = body.cloneNode(true);
    replacement.dataset.fixtureMailSn = location.pathname.split('/').at(-1);
    body.replaceWith(replacement);
  }, { sn, render });
}
