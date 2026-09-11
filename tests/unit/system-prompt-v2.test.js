/**
 * System Prompt v2 Tests
 *
 * The v2 identity prompt is the anti-scripted-behavior + anti-hallucination
 * root-cause fix. These tests pin the guardrails that must always be present:
 * - No inventing contact details (support emails were hallucinated in production)
 * - No false capability claims (account deletion claims were fabricated)
 * - No subject menus, no self-introduction monologues
 * - Conversational WhatsApp register
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SystemPromptBuilder } from '../../src/ai/prompt/SystemPromptBuilder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, '../../src/ai/prompt/templates/waxprep_identity.v2.txt');

describe('SystemPromptBuilder v2 (anti-scripted-behavior guardrails)', () => {
  it('v2 template file exists and loads', () => {
    const template = readFileSync(templatePath, 'utf-8');
    expect(template.length).toBeGreaterThan(500);
  });

  it('builds with v2 as the default prompt version', async () => {
    const builder = new SystemPromptBuilder(null);
    const result = await builder.build({
      waxId: '123e4567-e89b-12d3-a456-426614174000',
      sessionId: '123e4567-e89b-12d3-a456-426614174001',
      context: {},
    });
    expect(result.promptVersion).toBe('v2');
  });

  it('v1 remains loadable for rollback', async () => {
    const builder = new SystemPromptBuilder(null);
    const result = await builder.build({
      waxId: '123e4567-e89b-12d3-a456-426614174000',
      sessionId: '123e4567-e89b-12d3-a456-426614174001',
      context: { promptVersion: 'v1' },
    });
    expect(result.promptVersion).toBe('v1');
  });

  describe('template guardrails', () => {
    const template = readFileSync(templatePath, 'utf-8');

    it('forbids invented contact details', () => {
      expect(template).toContain('Never invent or guess contact details');
      expect(template).toContain('no support email');
    });

    it('the prompt itself contains NO email address that the model could echo', () => {
      // The v1-era bug: a hallucinated support email. The template must not
      // contain any email address at all.
      const emailMatches = template.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      expect(emailMatches).toBeNull();
    });

    it('forbids subject menus', () => {
      expect(template).toContain('Never send a list of subjects');
    });

    it('forbids self-introduction monologues and capability pitches', () => {
      expect(template).toContain('Never introduce yourself with a long greeting');
    });

    it('grounds the deletion capability in the real privacy tool', () => {
      expect(template).toContain('delete the student\'s data when they clearly ask');
      expect(template).toContain('privacy tool');
    });

    it('forbids claiming actions without tools', () => {
      expect(template).toContain('Never claim to perform an action you have no tool for');
    });

    it('keeps the WhatsApp conversational register instructions', () => {
      expect(template).toContain('HOW TO CONVERSE');
      expect(template).toContain('WhatsApp');
      expect(template).toContain('FIRST CONTACT');
    });

    it('keeps the crisis support section', () => {
      expect(template).toContain('SAFETY BOUNDARIES');
      expect(template).toContain('+234 909 000 4673');
      expect(template).toContain('mentallyaware.org');
    });

    it('interpolates the current date', async () => {
      const builder = new SystemPromptBuilder(null);
      const result = await builder.build({
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        context: {},
      });
      const currentDate = new Date().toISOString().split('T')[0];
      expect(result.systemPrompt).toContain(currentDate);
      expect(result.systemPrompt).not.toContain('{{currentDate}}');
    });
  });

  describe('fallback template', () => {
    it('mirrors v2 guardrails so a missing file cannot regress behavior', async () => {
      const builder = new SystemPromptBuilder(null);
      const result = await builder.build({
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        context: { promptVersion: 'nonexistent-version' },
      });

      expect(result.systemPrompt).toContain('HONESTY AND CAPABILITIES');
      expect(result.systemPrompt).toContain('Never invent or guess contact details');
      expect(result.systemPrompt).toContain('Never send a list of subjects');
      expect(result.systemPrompt).not.toContain('{{currentDate}}');
    });
  });
});
