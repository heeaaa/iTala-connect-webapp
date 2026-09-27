import sanitizeHtml from 'sanitize-html';

/**
 * Rules HTML allow-list (PRD E-70, E-71): exactly the old toolbar's output.
 * Used on save and again on render, so stored HTML is never trusted.
 * The only attribute kept is a numbered list's start number (typing "3. "
 * starts a list at 3), and only as a plain number: no links, styles, event
 * handlers or URLs survive.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li'];

export function sanitizeRulesHtml(html: string | null | undefined): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { ol: ['start'] },
    transformTags: {
      // The old editor wrapped lines in <div>; keep the text as paragraphs.
      div: 'p',
      ol: (tagName, attribs) => {
        const kept: Record<string, string> = {};
        if (/^[1-9]\d{0,3}$/.test(attribs.start ?? '')) kept.start = attribs.start!;
        return { tagName, attribs: kept };
      },
    },
    // Script and style bodies are dropped, not shown as text.
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'template'],
    disallowedTagsMode: 'discard',
  }).trim();
}

/** True when the sanitised rules have no visible text ("No rules."). */
export function isEmptyRules(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, '') === '';
}
