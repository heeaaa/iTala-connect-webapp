import { sanitizeRulesHtml } from '@/lib/rules-html';

// These two Google Docs pastes arrived with every line marked as a heading.
// Keep their wording while restoring paragraph/list structure and calmer casing.
export const BATANG_PINOY_ID = '-P08tvBDGZKmSa6AGnNm';
export const BROTHERHOOD_ID = '-P13BNr-wtp2IdjiL2Hz';

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
const tidy = (html: string) => html.replace(/\s+/g, ' ').trim();
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function calmWords(line: string): string {
  return line
    .replace(/\bPLUS\b/g, 'plus')
    .replace(/\bFREE\b/g, 'free')
    .replace(/\bBYE\b/g, 'bye')
    .replace(/\bBEFORE\b/g, 'before')
    .replace(/\bTECHNICAL FOUL\b/g, 'technical foul')
    .replace(/\bGAME EJECTION\b/g, 'game ejection')
    .replace(/\bNO EXCEPTIONS\b/g, 'No exceptions')
    .replace(/\bYOU HAVE BEEN WARNED\b/g, 'you have been warned')
    .replace(/\bQUOTIENT\b/g, 'Quotient');
}

function sentenceCase(line: string): string {
  const lower = line.toLocaleLowerCase('en');
  return lower
    .replace(
      /^([\d]+\.\s*|•\s*)?([a-z])/,
      (_whole, prefix: string | undefined, letter: string) => `${prefix ?? ''}${letter.toUpperCase()}`,
    )
    .replace(/([.!?]\s+)([a-z])/g, (_whole, gap: string, letter: string) => `${gap}${letter.toUpperCase()}`);
}

function batangRules(html: string): string {
  const headings = new Map([
    ['OPEN DIVISION', 'Open division'],
    ['SEASON FORMAT', 'Season format'],
    ['OPEN DIVISION 1', 'Open division 1'],
    ['OPEN DIVISION 2', 'Open division 2'],
    ['AWARDS!!', 'Awards'],
    ['BALIKLARO 35+ DIVISION', 'Baliklaro 35+ division'],
  ]);
  const parts: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) parts.push(`<ul>${list.join('')}</ul>`);
    list = [];
  };
  for (const match of html.matchAll(/<p>(.*?)<\/p>/gs)) {
    const value = tidy(plain(match[1] ?? ''));
    if (!value) continue;
    const heading = headings.get(value);
    if (heading) {
      flush();
      parts.push(`<h2>${heading}</h2>`);
    } else if (value.startsWith('•')) {
      list.push(`<li>${escapeHtml(calmWords(sentenceCase(value.slice(1).trim())))}</li>`);
    } else {
      flush();
      let copy = value.replace(/^DIV ([12]) /, 'Division $1 ').replace(/^BALIKLARO35\+ /, 'Baliklaro 35+ ');
      if (copy.includes(' = ')) {
        const [label, reward] = copy.split(' = ', 2);
        copy = `${sentenceCase(label ?? '')
          .replace(/\bmvp\b/g, 'MVP')
          .replace(/^Baliklaro/i, 'Baliklaro')}: ${sentenceCase(reward ?? '')}`;
      }
      parts.push(`<p>${escapeHtml(calmWords(copy))}</p>`);
    }
  }
  flush();
  return parts.join('');
}

function brotherhoodRules(html: string): string {
  const parts: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) parts.push(`<p>${escapeHtml(calmWords(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length) parts.push(`<ul>${bullets.join('')}</ul>`);
    bullets = [];
  };
  for (const match of html.matchAll(/<h2>(.*?)<\/h2>/gs)) {
    const source = tidy(plain(match[1] ?? ''));
    const raw = source.replace(/2026 BROTHERHOOD LEAGUE – RULES & REGULATIONS/g, '').trim();
    if (source === '2026 BROTHERHOOD LEAGUE – RULES & REGULATIONS') {
      parts.push('<h2>2026 Brotherhood league – rules and regulations</h2>');
      continue;
    }
    if (!raw) continue;
    const isHeading =
      /^\d{1,2}\.\s/.test(raw) ||
      /^(ELIMINATION ROUND:|PLAY-OFFS SEMIS AND FINALS:|MECHANICS OF THE GAME:|NOTE:)$/.test(raw);
    if (isHeading) {
      flushParagraph();
      flushBullets();
      parts.push(`<h2>${escapeHtml(sentenceCase(raw))}</h2>`);
    } else if (raw.startsWith('•')) {
      flushParagraph();
      flushBullets();
      bullets.push(`<li>${escapeHtml(calmWords(sentenceCase(raw.slice(1).trim())))}</li>`);
    } else if (bullets.length) {
      // Line wrapped in the source document; it continues the last bullet.
      const last = bullets.pop()!;
      bullets.push(
        last.replace(
          /<\/li>$/,
          ` ${escapeHtml(calmWords(raw === raw.toUpperCase() ? raw.toLocaleLowerCase('en') : raw))}</li>`,
        ),
      );
    } else {
      paragraph.push(
        raw === raw.toUpperCase() && /[A-Z]/.test(raw)
          ? paragraph.length
            ? raw.toLocaleLowerCase('en')
            : sentenceCase(raw)
          : raw,
      );
      if (/[.!?]$/.test(raw) && !/^(?:The|If|A|Each|Only|In)\s*$/.test(raw)) flushParagraph();
    }
  }
  flushParagraph();
  flushBullets();
  return parts.join('');
}

export function formatLegacyRules(legacyId: string, rawHtml: string): string {
  const html = sanitizeRulesHtml(rawHtml);
  if (legacyId === BATANG_PINOY_ID && /^<h2><p>OPEN DIVISION<\/p>/.test(html)) return batangRules(html);
  if (legacyId === BROTHERHOOD_ID && html.match(/<h2>/g)?.length && (html.match(/<h2>/g)?.length ?? 0) > 50)
    return brotherhoodRules(html);
  return html;
}
