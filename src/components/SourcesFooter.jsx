// Parse markdown output → ekstrak URL unik → render source cards.
// Sumber dianggap "citation" kalau URL muncul di teks (paragraf, daftar pustaka, atau inline).

import { useMemo } from 'react';

const URL_REGEX = /https?:\/\/[^\s)\]]+/gi;

// Domain yg sering muncul → label friendly
const DOMAIN_LABEL = {
  'arxiv.org': 'arXiv',
  'wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia EN',
  'id.wikipedia.org': 'Wikipedia ID',
  'doi.org': 'DOI',
  'scholar.google.com': 'Google Scholar',
  'sciencedirect.com': 'ScienceDirect',
  'springer.com': 'Springer',
  'nature.com': 'Nature',
  'science.org': 'Science',
  'ieee.org': 'IEEE',
  'acm.org': 'ACM',
  'github.com': 'GitHub'
};

function cleanUrl(raw) {
  // Hapus trailing punctuation yg sering ikut: . , ; : ) ] ' "
  return raw.replace(/[.,;:!?'")\]]+$/, '');
}

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getLabel(domain) {
  if (DOMAIN_LABEL[domain]) return DOMAIN_LABEL[domain];
  // Cek subdomain Wikipedia/arXiv
  for (const key of Object.keys(DOMAIN_LABEL)) {
    if (domain.endsWith(key)) return DOMAIN_LABEL[key];
  }
  return domain;
}

function getFaviconUrl(domain) {
  if (!domain) return null;
  // Pakai Google favicon service — gratis, no auth, 16/32/64
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export default function SourcesFooter({ content }) {
  const sources = useMemo(() => {
    if (!content) return [];
    const matches = content.match(URL_REGEX) || [];
    const seen = new Map();
    for (const raw of matches) {
      const url = cleanUrl(raw);
      const domain = getDomain(url);
      if (!domain) continue;
      if (!seen.has(url)) {
        seen.set(url, { url, domain, label: getLabel(domain) });
      }
    }
    return Array.from(seen.values()).slice(0, 12);
  }, [content]);

  if (sources.length === 0) return null;

  return (
    <div className="sources-footer">
      <div className="sources-footer__title">
        Sumber ({sources.length})
      </div>
      <div className="sources-footer__grid">
        {sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="source-card"
            title={s.url}
          >
            <img
              className="source-card__favicon"
              src={getFaviconUrl(s.domain)}
              alt=""
              loading="lazy"
              width={16}
              height={16}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="source-card__body">
              <span className="source-card__label">{s.label}</span>
              <span className="source-card__url">{shortenPath(s.url)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function shortenPath(url) {
  try {
    const u = new URL(url);
    let path = u.pathname + u.search;
    if (path === '/' || path === '') return u.hostname.replace(/^www\./, '');
    if (path.length > 48) path = path.slice(0, 45) + '…';
    return path;
  } catch {
    return url;
  }
}
