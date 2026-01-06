export const BMAD_GUIDELINES = {
    overview: `
# BMAD-METHOD (Breakthrough Method for Agile AI-Driven Development)

The BMAD method transforms chaotic "vibe coding" into a structured, agentic workflow. It uses specialized AI roles to plan, specify, and build software.

## Core Phases
1. **Agentic Planning**: Analyst & Architect design the system.
2. **Context-Engineered Development**: Developers build from strict specs.
3. **Verification**: QA verification.

## Workflow
1. **Product Requirements Document (PRD)**: The "Analyst" creates \`01_PRD.md\`.
2. **Architecture Design**: The "Architect" creates \`02_ARCH.md\`.
3. **Sprint Planning**: The "Scrum Master" breaks it into \`03_TASKS.md\`.
4. **Implementation**: The "Developer" implements tasks one by one.
`,

    planning: `
### Phase 1: Agentic Planning
**Role:** Product Manager / Analyst
**Goal:** Define *what* we are building.

**Deliverable:** \`01_PRD.md\`
- **Problem Statement**: What are we solving?
- **User Stories**: Who is it for?
- **Functional Requirements**: List of features.
- **Non-Functional Requirements**: Performance, Security, etc.
`,

    architecture: `
### Phase 2: Architecture Design
**Role:** System Architect
**Goal:** Define *how* we build it.

**Deliverable:** \`02_ARCH.md\`
- **Tech Stack**: Languages, frameworks, tools.
- **Data Model**: Schema, database design.
- **Component Diagram**: Mermaid diagrams of system flow.
- **API Specification**: Endpoints and interfaces.
- **Directory Structure**: Planned file layout.
`,

    development: `
### Phase 3: Context-Engineered Development
**Role:** Senior Developer
**Goal:** Write code that matches the spec.

**Process:**
1. **Read the PRD and ARCH** files first.
2. **Create the Project Structure** (folders/files).
3. **Implement Core Components** first (types, utils).
4. **Implement Features** iteratively.
5. **Verify** each step with tests.
`
};

export function getGuidelines(phase?: 'planning' | 'architecture' | 'development'): string {
    if (!phase) return BMAD_GUIDELINES.overview;
    return BMAD_GUIDELINES[phase] || BMAD_GUIDELINES.overview;
}
