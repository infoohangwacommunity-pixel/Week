/**
 * Response Normalizer Tests
 *
 * normalizeFormatting was previously DEAD code with mangling bugs. The
 * orchestrator now applies it on the production tool path, so these tests pin
 * the corrected WhatsApp-safe behavior:
 * - markdown bold/italic converts to WhatsApp syntax WITHOUT inserting spaces
 * - headers become bold lines
 * - bullets are REPLACED by WhatsApp bullets (not prefixed)
 * - emphasis adjacent to words survives untouched
 */

import { describe, it, expect } from 'vitest';
import { ResponseValidator } from '../../src/validation/ResponseValidator.js';

const validator = new ResponseValidator({ query: async () => ({ rows: [] }) });

describe('ResponseValidator.normalizeFormatting (now live on the production path)', () => {
  it('converts **bold** to WhatsApp *bold* without inner spacing', () => {
    expect(validator.normalizeFormatting('This is **important** to know'))
      .toBe('This is *important* to know');
  });

  it('does NOT mangle bold by inserting spaces (previous bug: "** bold**")', () => {
    const out = validator.normalizeFormatting('The answer is **42** okay');
    expect(out).not.toContain('* 42*');
    expect(out).toContain('*42*');
  });

  it('converts __italic__ to WhatsApp _italic_', () => {
    expect(validator.normalizeFormatting('it is __very__ good'))
      .toBe('it is _very_ good');
  });

  it('converts markdown headers to bold lines', () => {
    expect(validator.normalizeFormatting('## Photosynthesis'))
      .toBe('*Photosynthesis*');
  });

  it('REPLACES dashes with WhatsApp bullets (previous bug: "• - item")', () => {
    expect(validator.normalizeFormatting('- one\n- two')).toBe('• one\n• two');
  });

  it('replaces asterisk bullets (marker + space) with WhatsApp bullets', () => {
    expect(validator.normalizeFormatting('* item one\n* item two')).toBe('• item one\n• item two');
  });

  it('preserves emphasis at line start (not a bullet)', () => {
    const out = validator.normalizeFormatting('*Photosynthesis* is the process');
    expect(out).toBe('*Photosynthesis* is the process');
  });

  it('preserves negative numbers at line start', () => {
    expect(validator.normalizeFormatting('-5 is the temperature')).toBe('-5 is the temperature');
  });

  it('collapses excessive blank lines and trims trailing whitespace', () => {
    expect(validator.normalizeFormatting('a\n\n\n\nb   ')).toBe('a\n\nb');
  });

  it('leaves plain text untouched', () => {
    const text = 'Just a plain sentence about algebra. No formatting here.';
    expect(validator.normalizeFormatting(text)).toBe(text);
  });
});
