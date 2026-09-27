import { describe, expect, it } from 'vitest';
import { BATANG_PINOY_ID, BROTHERHOOD_ID, formatLegacyRules } from '@/migration/format-legacy-rules';

describe('the two migrated rules documents', () => {
  it('unwraps Batang Pinoy paragraphs and makes lists and headings readable', () => {
    const raw =
      '<h2><p>OPEN DIVISION</p><p><b><br></b></p><p>This season has 14 teams.</p><p>SEASON FORMAT</p><p>• 14 Teams</p><p>AWARDS!!</p><p>DIV 1 CHAMPIONS = Championship Trophy</p></h2>';
    expect(formatLegacyRules(BATANG_PINOY_ID, raw)).toBe(
      '<h2>Open division</h2><p>This season has 14 teams.</p><h2>Season format</h2><ul><li>14 teams</li></ul><h2>Awards</h2><p>Division 1 champions: Championship trophy</p>',
    );
  });

  it('demotes Brotherhood body lines, joins wrapped sentences, and removes repeated page headers', () => {
    const raw =
      '<h2>2026 BROTHERHOOD LEAGUE – RULES &amp; REGULATIONS</h2><h2>1. TEAM LINE-UP</h2><h2>Each player must submit a signed letter. The</h2><h2>allowable number of players is 15.</h2><h2>PLAY-OFFS SEMIS AND FINALS:</h2><h2>STOP CLOCK ON SUBSTITUTIONS</h2><h2>OF THE SECOND HALF ONLY.</h2><h2>first and2026 BROTHERHOOD LEAGUE – RULES &amp; REGULATIONS</h2><h2>second half.</h2>';
    const html = formatLegacyRules(BROTHERHOOD_ID, raw + '<h2>Body filler.</h2>'.repeat(51));
    expect(html).toContain('<h2>1. Team line-up</h2>');
    expect(html).toContain('<p>Each player must submit a signed letter. The allowable number of players is 15.</p>');
    expect(html).toContain('<h2>2026 Brotherhood league – rules and regulations</h2>');
    expect(html).not.toContain('first and2026');
    expect(html).not.toContain('<h2>STOP CLOCK');
  });

  it('leaves other events and organiser-edited rules intact', () => {
    const html = '<h2>House rules</h2><p>Be kind.</p>';
    expect(formatLegacyRules(BATANG_PINOY_ID, html)).toBe(html);
    expect(formatLegacyRules('other-event', html)).toBe(html);
  });
});
