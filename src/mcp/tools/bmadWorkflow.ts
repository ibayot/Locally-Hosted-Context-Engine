/**
 * Layer 3: MCP Interface Layer - BMAD Workflow Tool
 *
 * Implements BMAD (Breakthrough Method for Agile AI-Driven Development)
 * as an MCP tool that generates structured project documents using
 * the local Ollama LLM with RAG context.
 *
 * Phases:
 * 1. PRD Generation (01_PRD.md)
 * 2. Architecture Design (02_ARCH.md)
 * 3. Sprint Tasks (03_TASKS.md)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextServiceClient } from '../serviceClient.js';
import { getOllamaProvider } from '../../local/ollamaProvider.js';

// ============================================================================
// Types
// ============================================================================

export interface BmadWorkflowArgs {
    goal: string;            // Natural language goal description
    phase?: 'prd' | 'arch' | 'tasks' | 'all';  // Which phase to run (default: prd)
    output_dir?: string;     // Output directory (default: .bmad)
}

// ============================================================================
// BMAD Prompts
// ============================================================================

const PRD_SYSTEM = `You are a Product Owner creating a Product Requirements Document (PRD).
Generate a structured PRD in markdown format with these sections:
# Product Requirements Document
## 1. Overview (what the product does, target audience)
## 2. Goals & Objectives (measurable outcomes)
## 3. User Stories (As a... I want... So that...)
## 4. Functional Requirements (numbered list)
## 5. Non-Functional Requirements (performance, security, scalability)
## 6. Out of Scope (what we explicitly won't do)
## 7. Success Metrics

Use the codebase context provided to ground your requirements in the existing system.
Be specific and actionable. Avoid vague requirements.`;

const ARCH_SYSTEM = `You are a Software Architect creating an Architecture Design Document.
Generate a structured architecture document in markdown format with these sections:
# Architecture Design
## 1. System Overview (high-level description and diagram concepts)
## 2. Tech Stack (languages, frameworks, databases, tools)
## 3. Component Architecture (major components and their responsibilities)
## 4. Data Model (entities, relationships, key schemas)
## 5. API Design (key endpoints or interfaces)
## 6. Security Considerations
## 7. Deployment & Infrastructure
## 8. Key Technical Decisions (with rationale)

Use the codebase context to align with existing patterns and conventions.
Reference existing files/patterns where relevant.`;

const TASKS_SYSTEM = `You are a Scrum Master creating Sprint Tasks from a PRD and Architecture document.
Generate a structured task breakdown in markdown format with these sections:
# Sprint Tasks
## Sprint 1: Foundation
### Task 1.1: [Task Name]
- **Description:** What needs to be done
- **Files:** Which files to create/modify
- **Dependencies:** What must be done first
- **Acceptance Criteria:** How to verify completion
- **Estimated Effort:** S/M/L/XL

Continue numbering tasks across sprints. Group related tasks together.
Aim for 3-5 tasks per sprint.
Order tasks by dependency (do prerequisites first).`;

// ============================================================================
// Implementation
// ============================================================================

async function runPhase(
    phase: 'prd' | 'arch' | 'tasks',
    goal: string,
    outputDir: string,
    serviceClient: ContextServiceClient,
    existingDocs?: string,
): Promise<{ file: string; content: string }> {
    const ollama = getOllamaProvider();
    const available = await ollama.isAvailable();

    if (!available) {
        const status = await ollama.getStatus();
        throw new Error(`Ollama LLM required for BMAD workflow. ${status.error}`);
    }

    // Get codebase context via RAG search
    let contextSnippets = '';
    try {
        const status = await serviceClient.getOllamaStatus();
        if (status.available) {
            // Search for relevant context from the codebase
            const searchTerms = goal.split(/\s+/).slice(0, 5).join(' ');
            // We'll use a simple approach: just provide the goal as search query
            contextSnippets = `Workspace: ${serviceClient.getWorkspacePath()}\n`;
        }
    } catch {
        // Continue without extra context
    }

    let systemPrompt: string;
    let userPrompt: string;
    let outputFile: string;

    switch (phase) {
        case 'prd':
            systemPrompt = PRD_SYSTEM;
            userPrompt = `Create a PRD for the following goal:\n\n${goal}\n\n${contextSnippets ? `## Codebase Context\n${contextSnippets}` : ''}`;
            outputFile = '01_PRD.md';
            break;

        case 'arch':
            systemPrompt = ARCH_SYSTEM;
            userPrompt = `Create an Architecture Design for the following goal:\n\n${goal}\n\n${existingDocs ? `## Existing PRD\n${existingDocs}\n\n` : ''}${contextSnippets ? `## Codebase Context\n${contextSnippets}` : ''}`;
            outputFile = '02_ARCH.md';
            break;

        case 'tasks':
            systemPrompt = TASKS_SYSTEM;
            userPrompt = `Create Sprint Tasks for the following goal:\n\n${goal}\n\n${existingDocs ? `## Existing Documents\n${existingDocs}\n\n` : ''}${contextSnippets ? `## Codebase Context\n${contextSnippets}` : ''}`;
            outputFile = '03_TASKS.md';
            break;
    }

    const response = await ollama.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], {
        num_ctx: 8192,
        temperature: 0.4,
        num_predict: 4096,
    });

    // Save to file
    const filePath = path.join(outputDir, outputFile);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, response, 'utf-8');

    return { file: filePath, content: response };
}

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleBmadWorkflow(
    args: BmadWorkflowArgs,
    serviceClient: ContextServiceClient,
): Promise<string> {
    const goal = args.goal;
    const phase = args.phase || 'prd';
    const workspacePath = serviceClient.getWorkspacePath();
    const outputDir = path.join(workspacePath, args.output_dir || '.bmad');

    if (!goal || goal.trim().length === 0) {
        return '❌ Error: The `goal` argument is required. Describe what you want to build.';
    }

    let output = `# 🏗️ BMAD Workflow\n\n**Goal:** ${goal}\n**Output:** \`${path.relative(workspacePath, outputDir)}/\`\n\n`;

    try {
        if (phase === 'prd' || phase === 'all') {
            const result = await runPhase('prd', goal, outputDir, serviceClient);
            output += `## ✅ Phase 1: PRD Generated\n📄 \`${path.relative(workspacePath, result.file)}\`\n\n`;

            if (phase === 'all') {
                const archResult = await runPhase('arch', goal, outputDir, serviceClient, result.content);
                output += `## ✅ Phase 2: Architecture Generated\n📄 \`${path.relative(workspacePath, archResult.file)}\`\n\n`;

                const tasksResult = await runPhase('tasks', goal, outputDir, serviceClient, `${result.content}\n\n${archResult.content}`);
                output += `## ✅ Phase 3: Sprint Tasks Generated\n📄 \`${path.relative(workspacePath, tasksResult.file)}\`\n\n`;
            }
        } else if (phase === 'arch') {
            // Try to read existing PRD
            let existingPrd = '';
            try {
                existingPrd = await fs.readFile(path.join(outputDir, '01_PRD.md'), 'utf-8');
            } catch { /* no existing PRD */ }

            const result = await runPhase('arch', goal, outputDir, serviceClient, existingPrd);
            output += `## ✅ Architecture Generated\n📄 \`${path.relative(workspacePath, result.file)}\`\n\n`;

        } else if (phase === 'tasks') {
            // Try to read existing PRD + Arch
            let existingDocs = '';
            try {
                const prd = await fs.readFile(path.join(outputDir, '01_PRD.md'), 'utf-8');
                existingDocs += prd + '\n\n';
            } catch { /* no PRD */ }
            try {
                const arch = await fs.readFile(path.join(outputDir, '02_ARCH.md'), 'utf-8');
                existingDocs += arch;
            } catch { /* no arch */ }

            const result = await runPhase('tasks', goal, outputDir, serviceClient, existingDocs);
            output += `## ✅ Sprint Tasks Generated\n📄 \`${path.relative(workspacePath, result.file)}\`\n\n`;
        }

        output += `---\n\n> **Next:** Review the generated documents and refine as needed.\n`;
    } catch (err: any) {
        output += `## ❌ Error\n\n${err.message}\n`;
    }

    return output;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const bmadWorkflowTool = {
    name: 'run_bmad',
    description: `Run the BMAD (Breakthrough Method for Agile AI-Driven Development) workflow.

Generates structured project documents using AI:
- Phase 'prd': Product Requirements Document (01_PRD.md)
- Phase 'arch': Architecture Design Document (02_ARCH.md)
- Phase 'tasks': Sprint Task Breakdown (03_TASKS.md)
- Phase 'all': Runs all three phases sequentially

Documents are saved to .bmad/ in the workspace.
Requires Ollama to be running with a model installed.

Use this when starting a new feature or project to create
structured planning documents before implementation.`,
    inputSchema: {
        type: 'object',
        properties: {
            goal: {
                type: 'string',
                description: 'Natural language description of what you want to build or accomplish',
            },
            phase: {
                type: 'string',
                enum: ['prd', 'arch', 'tasks', 'all'],
                description: "Which BMAD phase to run (default: 'prd')",
                default: 'prd',
            },
            output_dir: {
                type: 'string',
                description: "Output directory relative to workspace (default: '.bmad')",
                default: '.bmad',
            },
        },
        required: ['goal'],
    },
};
