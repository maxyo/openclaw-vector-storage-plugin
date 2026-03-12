import { describe, expect, it } from 'vitest';
import { getSourceProfile } from '../src/ingest/source-profiles.js';

describe('source profiles', () => {
  it('matches cbr.ru and returns extraction/provenance defaults', () => {
    const profile = getSourceProfile('https://cbr.ru/press/pr/?file=13022026_133000key.htm');

    expect(profile?.id).toBe('cbr');
    expect(profile?.sourceType).toBe('cbr');
    expect(profile?.sourceName).toBe('Bank of Russia');
    expect(profile?.documentType).toBe('press_release');
    expect(profile?.provenanceDefaults?.sourcePriority).toBe('primary');
    expect(profile?.provenanceDefaults?.isOfficialSource).toBe(true);
    expect(profile?.provenanceDefaults?.trustScore).toBe(0.98);
    expect(profile?.metadataDefaults?.['policy_body']).toBe('CBR');
  });

  it('matches moex domains', () => {
    const profile = getSourceProfile('https://iss.moex.com/iss/securities/RBM6.json?iss.meta=off');

    expect(profile?.id).toBe('moex');
    expect(profile?.sourceType).toBe('moex');
    expect(profile?.sourceName).toBe('Moscow Exchange');
  });

  it('matches secondary analytics sites', () => {
    expect(getSourceProfile('https://econs.online/articles/some-article/')?.id).toBe('econs');
    expect(getSourceProfile('https://www.acra-ratings.ru/research/1234/')?.id).toBe('acra');
    expect(getSourceProfile('https://raexpert.ru/researches/banks/test/')?.id).toBe('raexpert');
    expect(getSourceProfile('https://www.bofit.fi/en/monitoring/weekly/2026/v202610/')?.id).toBe('bofit');
    expect(getSourceProfile('https://cbonds.ru/articles/123456/')?.id).toBe('cbonds');
  });
});
