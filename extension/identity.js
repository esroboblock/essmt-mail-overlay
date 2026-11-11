// Isolated-world adapter for the observed demo list contract. Keep IDs as strings.
(() => {
  function identifyMail(linkPath, classMailSn) {
    if (typeof linkPath !== 'string') return null;
    const match = /^\/v2\/popup\/read\/(0|[1-9]\d*)\/([1-9]\d*)$/.exec(linkPath);
    if (!match || match[2] !== classMailSn) return null;
    return { folder_sn: match[1], mail_sn: match[2] };
  }
  function identifyRow(row) {
    const links = row.querySelectorAll('a.mail_title_link');
    const classes = [...row.classList].filter(name => name.startsWith('mail-'));
    if (links.length !== 1 || classes.length !== 1) return null;
    return identifyMail(links[0].getAttribute('href'), classes[0].slice(5));
  }
  const validESSMTSerial = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) &&
    value.length <= 10 && Number(value) <= 2147483647;
  globalThis.ESSMTOverlay = { identifyMail, identifyRow, validESSMTSerial };
})();
