/**
 * Tool-Calling Orchestrator Wrapper
 * 
 * Wraps the existing AIOrchestrator to add tool calling capability.
 * This is a transitional solution until the AIOrchestrator is refactored.
 * 
 * Phase G Stage 35: Tool Interface and Registry
 */

import { AIOrchestrator } from './AIOrchestrator.js';
import ToolRegistry from '../tools/ToolRegistry.js';
import { ToolExecutor } from '../tools/ToolExecutor.js';
import { SafetyClassifier } from '../safety/SafetyClassifier.js';
import { SafetyLevel } from '../safety/SafetyClassifier.js';
import { CrisisProtocol } from '../safety/CrisisProtocol.js';
import config from '../config/index.js';

/**
 * Tool-Calling Orchestrator
 * 
 * Extends AIOrchestrator with tool calling capability.
 * Handles the complete tool call loop:
 * 1. AI requests tool
 * 2. Validate and execute tool
 * 3. Return result to AI
 * 4. Continue until no more tool calls
 */
export class ToolCallingOrchestrator {
  constructor({ 
    aiOrchestrator, 
    toolExecutor, 
    safetyClassifier, 
    crisisProtocol,
    db,
    logger 
  }) {
    this.aiOrchestrator = aiOrchestrator;
    this.toolExecutor = toolExecutor;
    this.safetyClassifier = safetyClassifier;
    this.crisisProtocol = crisisProtocol;
    this.db = db;
    this.logger = logger;
    
    this.maxToolCalls = config.TOOL_MAX_CALLS_PER_SESSION;
  }

  /**
   * Complete an AI request with tool calling support
   */
  async complete({ waxId, sessionId, currentMessage, context = {} }) {
    const maxTurns = 5; // Prevent infinite loops
    let turn = 0;
    let accumulatedToolCalls = 0;

    while (turn < maxTurns) {
      turn++;
      
      const result = await this.executeTurn({
        waxId,
        sessionId,
        currentMessage,
        context,
        turn,
        accumulatedToolCalls,
      });

      if (!result.needsMoreTurns) {
        return result;
      }

      // Update currentMessage for next turn
      currentMessage = null; // Continue from tool results
      context = {
        ...context,
        toolResults: result.toolResults,
      };

      accumulatedToolCalls += result.toolCallCount;
    }

    // Max turns reached, return with error
    return {
      content: 'I\'m having trouble completing this request. Could you please rephrase?',
      finishReason: 'MAX_TURNS_REACHED',
      toolCallCount: accumulatedToolCalls,
      error: 'Maximum tool call turns reached',
    };
  }

  /**
   * Execute a single turn
   */
  async executeTurn({ waxId, sessionId, currentMessage, context, turn, accumulatedToolCalls }) {
    const log = this.logger.child({ 
      waxId, 
      sessionId, 
      turn,
      accumulatedToolCalls,
    });

    log.info('Executing AI turn');

    try {
      // Step 1: Run safety classification (Stage 45)
      const safetyResult = await this.safetyClassifier.classify({
        waxId,
        sessionId,
        aiRequestId: context.aiRequestId,
        content: currentMessage || (context.messages?.[context.messages.length - 1]?.content || ''),
      });

      // Step 2: Check for crisis (Stage 46)
      if (safetyResult.level === SafetyLevel.LEVEL_3_CRISIS) {
        log.warn('Crisis detected at Level 3', { safetyResult });
        
        const crisisResponse = await this.crisisProtocol.handleCrisis({
          waxId,
          sessionId,
          aiRequestId: context.aiRequestId,
          level: SafetyLevel.LEVEL_3_CRISIS,
          safetyEventId: safetyResult.eventId,
        });

        return {
          content: crisisResponse.message,
          finishReason: 'CRISIS_RESPONSE',
          safetyEvent: safetyResult,
          crisisResponse: true,
          needsMoreTurns: false,
        };
      }

      // Step 3: Call AI orchestrator
      const aiResult = await this.aiOrchestrator.complete({
        waxId,
        sessionId,
        currentMessage,
        context: {
          ...context,
          toolDefinitions: this.getToolDefinitions(),
        },
      });

      // Step 4: Check for tool calls
      if (aiResult.finishReason === 'TOOL_CALL' && aiResult.toolCalls) {
        log.info({ toolCalls: aiResult.toolCalls.length }, 'AI requested tool calls');

        // Check rate limit
        if (accumulatedToolCalls + aiResult.toolCalls.length > this.maxToolCalls) {
          log.warn('Tool call limit would be exceeded');
          return {
            ...aiResult,
            content: 'I\'ve reached my limit for this conversation. Please start a new topic.',
            finishReason: 'TOOL_LIMIT_REACHED',
            needsMoreTurns: false,
          };
        }

        // Step 5: Execute tool calls
        const toolResults = await this.executeToolCalls({
          waxId,
          sessionId,
          toolCalls: aiResult.toolCalls,
          aiRequestId: context.aiRequestId,
        });

        // Step 6: Build next message with tool results
        const nextMessage = this.buildToolResultMessage(toolResults);

        return {
          ...aiResult,
          toolResults,
          toolCallCount: aiResult.toolCalls.length,
          needsMoreTurns: true,
          nextMessage,
        };
      }

      // No tool calls, return AI result
      return {
        ...aiResult,
        needsMoreTurns: false,
      };

    } catch (error) {
      log.error({ error }, 'Turn execution failed');
      throw error;
    }
  }

  /**
   * Execute multiple tool calls
   */
  async executeToolCalls({ waxId, sessionId, toolCalls, aiRequestId }) {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.toolExecutor.execute({
          waxId,
          sessionId,
          aiRequestId,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          turnIndex: results.length,
        });

        results.push({
          toolName: toolCall.name,
          toolId: toolCall.id,
          success: result.success,
          data: result.data,
          error: result.error ? result.error.message : null,
        });
      } catch (error) {
        results.push({
          toolName: toolCall.name,
          toolId: toolCall.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get tool definitions for AI context
   */
  getToolDefinitions() {
    // Return only tools that should be exposed to AI
    const publicTools = ToolRegistry.getToolRegistry().filter(
      tool => tool.permission_level !== 'INTERNAL'
    );

    return publicTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));
  }

  /**
   * Build message with tool results
   */
  buildToolResultMessage(toolResults) {
    const parts = toolResults.map((result, index) => {
      if (result.success) {
        return `[Tool ${index + 1} Result: ${result.toolName}]\n${JSON.stringify(result.data, null, 2)}`;
      } else {
        return `[Tool ${index + 1} Error: ${result.toolName}]\nError: ${result.error}`;
      }
    });

    return {
      role: 'user',
      content: 'Tool Results:\n\n' + parts.join('\n\n'),
    };
  }
}

export default ToolCallingOrchestrator;
