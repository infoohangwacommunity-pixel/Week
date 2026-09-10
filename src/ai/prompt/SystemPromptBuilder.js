/**
 * WaxPrep - System Prompt Builder
 * 
 * Builds the system prompt from version-controlled templates.
 * The prompt defines WAXPREP's identity without embedding curriculum.
 * 
 * The prompt loads from files—not hardcoded strings.
 * Every prompt change produces a new version identifier.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * SystemPromptBuilder - Builds system prompts from templates
 */
export class SystemPromptBuilder {
  constructor(database) {
    this.db = database;
    this.templateCache = new Map();
    this.versionCache = new Map();
  }

  /**
   * Build the system prompt for a request
   * 
   * @param {Object} options - Build options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Object} options.context - Additional context
   * @returns {Promise<Object>} - { systemPrompt, promptVersion }
   */
  async build({ waxId, sessionId, context = {} }) {
    // Default to v1 prompt
    const promptVersion = context.promptVersion || 'v1';
    
    // Load template
    const template = await this.loadTemplate(promptVersion);
    
    // Build the prompt
    const systemPrompt = this.interpolate(template, {
      waxId,
      sessionId,
      currentDate: new Date().toISOString().split('T')[0],
      ...context,
    });

    return {
      systemPrompt,
      promptVersion,
    };
  }

  /**
   * Load a prompt template from file
   * 
   * @param {string} version - Prompt version
   * @returns {Promise<string>} - Template text
   */
  async loadTemplate(version) {
    // Check cache first
    if (this.templateCache.has(version)) {
      return this.templateCache.get(version);
    }

    const templatePath = join(__dirname, 'templates', `waxprep_identity.${version}.txt`);

    try {
      const template = readFileSync(templatePath, 'utf-8');
      this.templateCache.set(version, template);
      return template;
    } catch (error) {
      // Fallback to default template
      console.warn(`[SystemPromptBuilder] Template not found: ${templatePath}, using default`);
      return this.getDefaultTemplate();
    }
  }

  /**
   * Get the default template if file doesn't exist
   * 
   * @returns {string} - Default template
   */
  getDefaultTemplate() {
    return `WAXPREP IDENTITY AND BEHAVIOR GUIDELINES

You are WAXPREP, an AI tutor designed to help Nigerian secondary school students learn through natural conversation.

YOUR IDENTITY
- You are an AI tutor, not a friend or therapist
- You are patient, encouraging, and academically responsible
- You are aware of the Nigerian educational context (WAEC, NECO, JAMB, BECE, JSS, SSS)
- You do not have a physical form or personal life

YOUR PURPOSE
- Help students understand concepts, not just get answers
- Explain ideas clearly and scaffold learning appropriately
- Ask questions to check understanding
- Provide worked examples when helpful
- Adapt your explanations to the student's demonstrated understanding
- Be honest about what you don't know

YOUR COMMUNICATION STYLE
- Clear and concise (WhatsApp-friendly messages)
- Supportive and encouraging
- Use examples relevant to Nigerian students when appropriate
- Avoid overly technical jargon unless explaining it
- Break complex ideas into smaller, manageable parts

ACADEMIC INTEGRITY
- Teach students how to think, not what to think
- Provide hints and guidance before giving full answers
- Explain the reasoning behind concepts
- Encourage students to attempt problems themselves
- Help them understand mistakes, not just correct them

SAFETY BOUNDARIES
If a student mentions:
- Self-harm or suicidal thoughts: Provide help resources and encourage them to speak with a trusted adult
- Dangerous activities: Warn against them and explain the risks
- Sexual content: Politely redirect to appropriate topics
- Illegal activities: Explain why they are harmful and illegal
- Any serious safety concern: Take it seriously and provide appropriate guidance

IMPORTANT REMINDERS
- Never invent facts or pretend to know something you don't
- If you're unsure about something, admit it
- Focus on helping the student learn, not just completing tasks
- Be mindful that students may be minors
- Respect the student's intelligence while providing appropriate support

CURRENT DATE: {{currentDate}}

Remember: You are here to educate, not to enable shortcut-taking. Help students build genuine understanding.`;
  }

  /**
   * Interpolate variables into the template
   * 
   * @param {string} template - Template text
   * @param {Object} variables - Variables to interpolate
   * @returns {string} - Interpolated prompt
   */
  interpolate(template, variables) {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }

    return result;
  }

  /**
   * Calculate prompt version hash
   * 
   * @param {string} template - Template text
   * @returns {string} - Version hash
   */
  calculateVersionHash(template) {
    return createHash('sha256').update(template).digest('hex').substring(0, 8);
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.templateCache.clear();
    this.versionCache.clear();
  }
}

/**
 * Simple prompt versioning utility
 */
export class PromptVersioning {
  /**
   * Calculate version from template
   * 
   * @param {string} template - Template text
   * @returns {string} - Version identifier
   */
  static getVersion(template) {
    const hash = createHash('sha256').update(template).digest('hex');
    return `v${hash.substring(0, 8)}`;
  }

  /**
   * Increment version
   * 
   * @param {string} currentVersion - Current version
   * @returns {string} - Next version
   */
  static incrementVersion(currentVersion) {
    const match = currentVersion.match(/^v(\d+)$/);
    if (!match) {
      return 'v1';
    }
    const versionNumber = parseInt(match[1], 10);
    return `v${versionNumber + 1}`;
  }
}

export default SystemPromptBuilder;
