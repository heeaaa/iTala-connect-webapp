import sanitizeHtml from 'sanitize-html';

/**
 * Rules HTML allow-list (PRD E-70, E-71): exactly the old toolbar's output.
 * Used on save and again on render, so stored HTML is never trusted.
 * No attributes survive, so no links, styles, event handlers or URLs.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li'];

export function sanitizeRulesHtml(html: string | null | undefined): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    // The old editor wrapped lines in <div>; keep the text as paragraphs.
    transformTags: { div: 'p' },
    // Script and style bodies are dropped, not shown as text.
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'template'],
    disallowedTagsMode: 'discard',
  }).trim();
}

/** True when the sanitised rules have no visible text ("No rules."). */
export function isEmptyRules(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, '') === '';
}
