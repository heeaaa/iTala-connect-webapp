import { describe, expect, it } from 'vitest';

import { isEmptyRules, sanitizeRulesHtml } from '@/lib/rules-html';

describe('rules HTML sanitiser (PRD E-71)', () => {
  it('keeps the toolbar formatting', () => {
    const html =
      '<h2>Timing</h2><p><strong>Four</strong> <em>10</em>-minute <u>quarters</u>.</p><ul><li>One</li></ul><ol><li>Two</li></ol><h3>Fouls</h3>';
    expect(sanitizeRulesHtml(html)).toBe(html);
  });

  it.each([
    ['<script>alert(1)</script><p>ok</p>', '<p>ok</p>'],
    ['<img src=x onerror=alert(1)>', ''],
    ['<p onclick="alert(1)" style="color:red">hi</p>', '<p>hi</p>'],
    ['<a href="javascript:alert(1)">click</a>', 'click'],
    ['<iframe src="https://evil.example"></iframe>text', 'text'],
    ['<svg><script>alert(1)</script></svg>', ''],
    ['<style>body{display:none}</style><p>x</p>', '<p>x</p>'],
    ['<p>a</p><object data="x"></object>', '<p>a</p>'],
    ['<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>', ''],
  ])('strips %s', (input, expected) => {
    expect(sanitizeRulesHtml(input)).toBe(expected);
  });

  it("keeps a numbered list's start number, and only a plain number", () => {
    expect(sanitizeRulesHtml('<ol start="3"><li>Third</li></ol>')).toBe('<ol start="3"><li>Third</li></ol>');
    expect(sanitizeRulesHtml('<ol start="12"><li>Twelfth</li></ol>')).toBe('<ol start="12"><li>Twelfth</li></ol>');
    expect(sanitizeRulesHtml('<ol start="d"><li>a</li></ol>')).toBe('<ol><li>a</li></ol>');
    expect(sanitizeRulesHtml('<ol start="1" type="a" onclick="x()"><li>a</li></ol>')).toBe(
      '<ol start="1"><li>a</li></ol>',
    );
    expect(sanitizeRulesHtml('<ol start="0"><li>a</li></ol>')).toBe('<ol><li>a</li></ol>');
    expect(sanitizeRulesHtml('<ol start="3 onmouseover=x"><li>a</li></ol>')).toBe('<ol><li>a</li></ol>');
    expect(sanitizeRulesHtml('<ol start="99999"><li>a</li></ol>')).toBe('<ol><li>a</li></ol>');
    expect(sanitizeRulesHtml('<ul start="3"><li>a</li></ul>')).toBe('<ul><li>a</li></ul>');
  });

  it('turns the old editor divs into paragraphs and handles empty input', () => {
    expect(sanitizeRulesHtml('<div>Line</div>')).toBe('<p>Line</p>');
    expect(sanitizeRulesHtml(null)).toBe('');
    expect(sanitizeRulesHtml(undefined)).toBe('');
  });

  it('treats markup with no visible text as no rules', () => {
    expect(isEmptyRules('')).toBe(true);
    expect(isEmptyRules('<p>&nbsp;</p><p> </p><br>')).toBe(true);
    expect(isEmptyRules('<p>Play fair</p>')).toBe(false);
  });
});
