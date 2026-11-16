(() => {
  const { validESSMTSerial, validateResults } = globalThis.ESSMTOverlay;
  const fixtureOrigin = 'http://localhost:4173';
  const naverOrigin = 'https://mail.naver.com';
  const fail = code => Object.assign(new Error(code), { code });

  function detailRoute(url, origin) {
    if (url.origin !== origin || url.search || url.hash) return null;
    const match = /^\/v2\/read\/(-1|0|[1-9][0-9]*)\/([1-9][0-9]*)$/.exec(url.pathname);
    if (!match) return null;
    const [, folder_sn, mail_sn] = match;
    if (!validESSMTSerial(mail_sn) || !(folder_sn === '-1' || folder_sn === '0' || validESSMTSerial(folder_sn))) return null;
    return { folder_sn, mail_sn };
  }

  const tag = value => validESSMTSerial(value?.id) && typeof value.name === 'string' && value.name.length > 0;
  const boundedText = value => typeof value === 'string' && [...value].length <= 256 &&
    !/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
  const token = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
  function validDetailInput(action, input) {
    const keys = Object.keys(input);
    if (action === 'suggestions') return keys.length === 0 || (keys.length === 1 && boundedText(input.query));
    if (action === 'attach') return keys.length === 1 &&
      (validESSMTSerial(input.tag_id) || (boundedText(input.name) && Boolean(input.name.trim())));
    if (action === 'detach') return keys.length === 1 && validESSMTSerial(input.tag_id);
    return action === 'lookup' && keys.length === 0;
  }

  async function requestDetail(config, target, action, input, fetcher = fetch) {
    const { validateConfig, postOverlay } = globalThis.ESSMTOverlay;
    validateConfig(config);
    const { target_token, ...selector } = input;
    const mutation = action === 'attach' || action === 'detach';
    if (!validESSMTSerial(target.mail_sn) || !validDetailInput(action, selector) ||
        (mutation ? !token(target_token) : Object.hasOwn(input, 'target_token'))) throw fail('INVALID_REQUEST');
    const payload = action === 'lookup' ? { messages: [target] } : { mail_sn: target.mail_sn, ...input };
    const result = await postOverlay(config, action, payload, fetcher);
    if (action === 'lookup') {
      try { return validateResults(result, { namespace: config.namespace }, [target]).get(target.mail_sn); }
      catch { throw fail('INVALID_RESPONSE'); }
    }
    if (action === 'suggestions' && token(result?.target_token) && Array.isArray(result.tags) &&
        result.tags.length <= 10 && result.tags.every(tag)) return result;
    if (mutation && typeof result?.changed === 'boolean' && (action === 'detach' || tag(result.tag))) return result;
    throw fail('INVALID_RESPONSE');
  }

  Object.assign(globalThis.ESSMTOverlay, { detailRoute, fixtureOrigin, naverOrigin, requestDetail, validDetailInput });
})();
