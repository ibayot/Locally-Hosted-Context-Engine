/**
 * Layer 3: MCP Interface Layer - Ollama LLM Status Tool
 *
 * Provides status and health information about the local Ollama LLM provider.
 */

import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface OllamaStatusArgs {
    // No arguments needed
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleOllamaStatus(
    _args: OllamaStatusArgs,
    serviceClient: ContextServiceClient
): Promise<string> {
    const status = await serviceClient.getOllamaStatus();

    let output = `# 🦙 Ollama LLM Status\n\n`;

    if (status.available) {
        output += `**Status:** ✅ Online\n`;
        output += `**Model:** \`${status.model}\`\n`;
        output += `**URL:** ${status.url}\n\n`;
    } else {
        output += `**Status:** ❌ Offline\n`;
        output += `**URL:** ${status.url}\n`;
        output += `**Error:** ${status.error}\n\n`;
    }

    if (status.models.length > 0) {
        output += `## Available Models\n\n`;
        for (const model of status.models) {
            const isCurrent = model === status.model || model.startsWith(status.model.split(':')[0]);
            output += `- \`${model}\`${isCurrent ? ' ← **active**' : ''}\n`;
        }
    } else {
        output += `## Setup Instructions\n\n`;
        output += `1. Start Ollama: \`ollama serve\`\n`;
        output += `2. Download a model: \`ollama pull qwen2.5-coder:7b\`\n`;
        output += `3. Set model via env: \`OLLAMA_MODEL=qwen2.5-coder:7b\`\n`;
    }

    output += `\n---\n\n`;
    output += `> **LLM-dependent tools** (create_plan, review_changes, enhance_prompt, etc.) `;
    output += status.available
        ? `are **enabled** and ready to use.`
        : `will **fall back** to retrieval-only mode until Ollama is available.`;

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const ollamaStatusTool = {
    name: 'ollama_status',
    description: `Check the status of the local Ollama LLM provider.

Shows whether Ollama is running, which model is configured,
and lists available models. Also indicates whether LLM-dependent
tools (planning, code review, prompt enhancement) are enabled.

Use this when:
- You want to verify LLM generation is available
- You need to troubleshoot why AI features aren't working
- You want to see which models are installed locally`,
    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },
};
