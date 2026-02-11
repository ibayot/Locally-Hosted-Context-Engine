# Context Engine (v1.2.0)

> **Agent-Driven Development for Local Environments**

The Context Engine serves as the "brain" for your AI Agents (Claude, Gemini, etc.), providing deep codebase understanding and structured workflow automation without relying on external cloud services for analysis.

## 🌟 Key Features

### 1. Agent-Driven BMAD Workflow
Implements the **Breakthrough Method for Agile AI-Driven Development**:
- **Scaffold**: Your agent runs `scaffold_bmad` to generate project templates (`01_PRD.md`, `02_ARCH.md`, `03_TASKS.md`) tailored to your goal.
- **Fill**: Your agent fills these templates using its superior reasoning, acting as Product Owner, Architect, and Engineer.
- **Execute**: The engine provides the context needed to implement the plan.

### 2. Deep Local Analysis (No Cloud Needed)
- **AST-Powered Search**: Find symbols (functions, classes) and their dependencies instantly.
- **Dependency Graph**: Visualize how your modules interact.
- **Security Scanning**: Detect secrets and vulnerabilities locally.
- **Context Retrieval**: "RAG-in-a-box" for your agent to understand any part of your code.

### 3. Optional Local LLM
Includes integration for [Ollama](https://ollama.com) (local LLM) to enable autonomous features. This is **disabled by default in v1.2.0** but can be enabled in `server.ts` for future scalability.

## 🚀 Quick Start

1. **Install**:
   ```bash
   git clone https://github.com/ibayot/local-context-engine.git
   cd local-context-engine
   npm install
   npm run build
   ```

2. **Start Server**:
   ```bash
   node dist/index.js
   ```

3. **Use with Agent**:
   - Ask your agent: *"I want to build a new feature. Scaffold a BMAD project for me."*
   - The agent will use `scaffold_bmad` to set up the workspace.

## 📚 Documentation
- [Capabilities & Tools](CAPABILITIES.md) - **Read this to see what the engine can do!**
- [Installation Guide](INSTALLATION.md)
- [Walkthrough](walkthrough.md) (Generated Artifact)

## 🤝 Contributing
Push changes to: `https://github.com/ibayot/local-context-engine.git`
