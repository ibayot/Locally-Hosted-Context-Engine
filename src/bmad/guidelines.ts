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

    product_owner: `
### Phase 0: Product Vision & Alignment (Discovery)
**Role:** Product Owner
**Goal:** Define the Vision and Acceptance Criteria. This is the "Interview Phase".

**Discovery Protocol:**
The Product Owner MUST first ask: **"Are we building an Application/Website or a Game?"**

#### Track A: Application / Website
If building an App, ask these **Leading Questions**:
1.  **Core Problem**: What specific problem does this solve for the user?
2.  **Target Audience**: Who is the primary user persona?
3.  **Platform Strategy**: Web-only, Mobile-first (PWA), or Native?
4.  **Key Features**: What are the top 3 items for the MVP?
5.  **Monetization**: SaaS, Ad-supported, or Free?

#### Track B: Game Development
If building a Game, ask these **Leading Questions**:
1.  **Genre & Vibe**: What is the genre (RPG, Platformer, Puzzle) and "feel"?
2.  **Dimensionality**: Is it 2D (Side-scroller, Top-down) or 3D?
3.  **Core Loop**: What is the player doing second-to-second (Jumping, Shooting, Solving)?
4.  **Art Style**: Pixel art, Low-poly, Realistic, or Abstract?
5.  **Progression**: How does the player get stronger/advance (Levels, XP, Loot)?

**Deliverable:** \`00_VISION.md\` (or section in PRD)
- **Vision Statement**: The high-level "why" of the project.
- **Success Metrics**: How do we measure success?
- **Acceptance Criteria**: Strict conditions for "Done".
- **Prioritization**: What is MVP, what is nice-to-have?
`,

    scrum_master: `
### Phase 2b: Sprint Planning & Task Breakdown
**Role:** Scrum Master
**Goal:** Turn the Architecture into actionable tasks.

**Deliverable:** \`03_TASKS.md\`
- **Task Breakdown**: Convert architectural components into small, atomic tasks.
- **Dependencies**: Identify what blocks what.
- **Estimation**: T-shirt sizing (S/M/L) for complexity.
- **Definition of Done**: Checklist for each task (Test, Lint, Doc).
- **Process Check**: Ensure the team is unblocked.
`,

    qa: `
### Phase 4: Quality & Verification
**Role:** QA Lead / SDET
**Goal:** Break the system to ensure it's robust.

**Deliverable:** \`04_TEST_PLAN.md\` & Verification Reports
- **Test Strategy**: Unit vs. Integration vs. E2E.
- **Edge Cases**: Identify boundary conditions and error states.
- **Manual Verification**: Walkthrough steps for the user.
- **Automated Tests**: Requirements for test coverage.
- **Security Check**: Verify no secrets or vulnerabilities (using \`scan_security\`).
`,

    ui_ux: `
### Phase 1b: Design & User Experience
**Role:** UI/UX Designer / Game Artist
**Goal:** Create a stunning, intuitive, and "wow" user interface (or Game Art).

**Deliverable:** \`01_DESIGN.md\`

#### For Apps/Websites:
- **Design System**: Typography, color palette, component library (e.g., Shadcn/Tailwind).
- **User Flows**: Critical user journeys (Login, Dashboard, Checkout).
- **Wireframes**: Layout structure for key pages.
- **Aesthetics**: "Wow" factor elements (glassmorphism, gradients, etc).

#### For Games:
- **Art Direction**: Color palette, mood board, asset style (Pixel/Vector).
- **HUD Design**: Health bars, inventory, score displays.
- **Menus**: Title screen, pause menu, settings.
- **Assets List**: Sprites, sounds, and music needed.
`,

    security: `
### Phase 2a: Security Engineering
**Role:** Security Engineer
**Goal:** Secure the application by design (Security-by-Design).

**Deliverable:** \`02_SECURITY.md\`
- **Threat Model**: Identify potential attack vectors (OWASP Top 10).
- **Auth Strategy**: Secure authentication & authorization (RBAC/ABAC).
- **Data Privacy**: Encryption at rest/transit, PII handling.
- **Audit Logging**: what needs to be tracked?
- **Security Checkpoints**: Where to inject automated scans.
`,

    devops: `
### Phase 5: Operations & Reliability (SRE)
**Role:** DevOps / SRE
**Goal:** Ensure the app lives long and prospers.

**Deliverable:** \`05_OPS.md\`
- **CI/CD Pipeline**: Automated build, test, and deploy workflows.
- **Infrastructure as Code**: Dockerfiles, Terraform, or Kubernetes configs.
- **Monitoring**: Health checks, logging strategy, and alerts.
- **Backup & Recovery**: Disaster recovery plan.
- **Maintenance**: Dependencies update strategy.
`,

    architecture: `
### Phase 2: Architecture Design
**Role:** System Architect
**Goal:** Define *how* we build it.

**Stack Selection Strategy:**
- **For Apps**: React, Next.js, Node.js, PostgreSQL, Tailwind.
- **For Games (Web)**: Phaser.js (2D), Three.js/React-Three-Fiber (3D), Godot (Web Export).
- **For Games (Native)**: Unity, Unreal, Godot.
// ... existing content ...

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

export function getGuidelines(phase?: 'product_owner' | 'planning' | 'ui_ux' | 'architecture' | 'security' | 'scrum_master' | 'development' | 'qa' | 'devops'): string {
    if (!phase) return BMAD_GUIDELINES.overview;
    // @ts-ignore - dynamic access
    return BMAD_GUIDELINES[phase] || BMAD_GUIDELINES.overview;
}
