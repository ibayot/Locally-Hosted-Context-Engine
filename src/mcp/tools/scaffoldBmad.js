/**
 * Layer 3: MCP Interface Layer - BMAD Scaffolding Tool
 *
 * Scaffolds the BMAD (Breakthrough Method for Agile AI-Driven Development)
 * project structure for external agents (Claude/Gemini) to populate.
 *
 * Creates:
 * - .bmad/01_PRD.md
 * - .bmad/02_ARCH.md
 * - .bmad/03_TASKS.md
 *
 * This replaces the internal LLM-driven workflow with an agent-driven one.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextServiceClient } from '../serviceClient.js';

// ============================================================================
// Types
// ============================================================================

export interface ScaffoldBmadArgs {
    goal: string;            // Natural language goal description
    output_dir?: string;     // Output directory (default: .bmad)
}

// ============================================================================
// Templates
// ============================================================================

const PRD_TEMPLATE = (goal: string) => `# Product Requirements Document
> **Goal**: ${goal}

## 1. Overview
[Agent: Insert high-level description here]

## 2. Goals & Objectives
- [ ] [Measurable goal 1]
- [ ] [Measurable goal 2]

## 3. User Stories
- **As a** [role], **I want** [feature], **So that** [benefit]

## 4. Functional Requirements
1. [Requirement 1]
2. [Requirement 2]

## 5. Non-Functional Requirements
- Performance: ...
- Security: ...

## 6. Success Metrics
- [Metric 1]
`;

const ARCH_TEMPLATE = `# Architecture Design

## 1. System Overview
[Agent: Insert system diagram/description]

## 2. Tech Stack
- Frontend: ...
- Backend: ...
- Database: ...

## 3. Component Architecture
[Agent: Describe key components]

## 4. Data Model
\`\`\`mermaid
erDiagram
    User ||--o{ Post : writes
\`\`\`

## 5. API Design
- \`GET /api/resource\`

## 6. Key Technical Decisions
- [Decision 1]
`;

const TASKS_TEMPLATE = `# Sprint Tasks

## Sprint 1: Foundation
### Task 1.1: [Task Name]
- **Description**: ...
- **Files**: ...
- **Criteria**: ...

## Sprint 2: Core Features
...
`;

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleScaffoldBmad(
    args: ScaffoldBmadArgs,
    serviceClient: ContextServiceClient,
): Promise<string> {
    const goal = args.goal;
    const workspacePath = serviceClient.getWorkspacePath();
    const outputDir = path.join(workspacePath, args.output_dir || '.bmad');

    if (!goal || goal.trim().length === 0) {
        return '❌ Error: The `goal` argument is required.';
    }

    // Create directory
    await fs.mkdir(outputDir, { recursive: true });

    // Create files if they don't exist
    const files = [
        { name: '01_PRD.md', content: PRD_TEMPLATE(goal) },
        { name: '02_ARCH.md', content: ARCH_TEMPLATE },
        { name: '03_TASKS.md', content: TASKS_TEMPLATE },
    ];

    const created: string[] = [];
    const existing: string[] = [];

    for (const f of files) {
        const filePath = path.join(outputDir, f.name);
        try {
            await fs.access(filePath);
            existing.push(f.name);
        } catch {
            await fs.writeFile(filePath, f.content, 'utf-8');
            created.push(f.name);
        }
    }

    return `# 🏗️ BMAD Scaffolding Complete for "${goal}"

Directory: \`${path.relative(workspacePath, outputDir)}/\`

**Created:**
${created.length > 0 ? created.map(f => `- ✅ \`${f}\``).join('\n') : '_None_'}

**Existing (Skipped):**
${existing.length > 0 ? existing.map(f => `- ⚠️ \`${f}\``).join('\n') : '_None_'}

> **Agent Instructions:**
> 1. Read \`01_PRD.md\` and fill it based on the goal.
> 2. Read \`02_ARCH.md\` and design the system.
> 3. Read \`03_TASKS.md\` and break down the work.
> 4. Use \`get_bmad_guidelines\` if you need role-specific advice.
`;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const scaffoldBmadTool = {
    name: 'scaffold_bmad',
    description: `Scaffold a BMAD project structure (.bmad/) for the agent to populate.
Creates 01_PRD.md, 02_ARCH.md, and 03_TASKS.md templates contextually linked to the user's goal.

Use this when starting a new feature to set up the workspace for the agent to perform the BMAD workflow manually.`,
    inputSchema: {
        type: 'object',
        properties: {
            goal: {
                type: 'string',
                description: 'Natural language goal for the project/feature',
            },
            output_dir: {
                type: 'string',
                description: "Output directory (default: '.bmad')",
                default: '.bmad',
            },
        },
        required: ['goal'],
    },
};
