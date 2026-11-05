// Strict demo contract: a relative observed popup path AND its matching row class.
export function identifyMail(linkPath, classMailSn) {
  if (typeof linkPath !== 'string') return null;
  const match = /^\/v2\/popup\/read\/(0|[1-9]\d*)\/([1-9]\d*)$/.exec(linkPath);
  if (!match || match[2] !== classMailSn) return null;
  return { folder_sn: match[1], mail_sn: match[2] };
}

export function identifyRow(row) {
  const links = row.querySelectorAll('a.mail_title_link');
  const classes = [...row.classList].filter(name => name.startsWith('mail-'));
  if (links.length !== 1 || classes.length !== 1) return null;
  return identifyMail(links[0].getAttribute('href'), classes[0].slice(5));
}
