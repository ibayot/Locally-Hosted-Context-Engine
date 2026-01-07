# Local Context Engine v1.0.0 (Production Ready)

Welcome to the **Local Context Engine**, a powerful, privacy-first, and completely free alternative to expensive cloud-based context indexers. 

This engine is designed to run locally on your machine, providing your AI agents with deep understanding of your codebase without ever sending your code to a third-party indexing service.

## 🚀 Key Features

*   **100% Local & Privacy-First**: 
    *   No code leaves your machine. 
    *   Embeddings are generated locally using ONNX Runtime.
    *   Vector store is file-based and lives in your workspace (`.local-context/`).
*   **Completely Free**: 
    *   Avoid usage-based fees from cloud indexers.
    *   Run as many projects as you want without cost.
*   **Production Ready**:
    *   Benchmarked for stability and performance.
    *   Includes automatic race-condition handling and robust error recovery.
    *   Seamless background indexing with low CPU impact.
*   **Offline Capable**:
    *   Once models are downloaded (first run only), the engine works entirely without internet access.
*   **Smart Features included**:
    *   **Semantic Search**: Find code by meaning, not just keywords.
    *   **Context Retrieval**: Smartly gathers relevant files and snippets for your prompt.
    *   **Security Scanning**: Built-in scanning for secrets and vulnerabilities.
    *   **BMAD Workflow Support**: Native integration with the Breakthrough Method for Agile AI-Driven Development (Product Owner, Analyst, UI/UX, Architect, Security, Developer, QA, DevOps).

## 📦 Architecture

The engine uses a modern stack optimized for local execution:
*   **Embedding Model**: Uses `@xenova/transformers` to run `all-MiniLM-L6-v2` (or similar) directly in Node.js.
*   **Vector Store**: A high-performance, disk-based JSON vector store optimized for retrieval speed.
*   **MCP Protocol**: Fully compliant Model Context Protocol server, compatible with Cursor, Windsurf, and other agents.

## 🛠️ Installation & Setup

Please see [INSTALLATION.md](./INSTALLATION.md) for detailed setup instructions.

### Quick Start
1.  **Clone** this repository to your preferred tools directory.
2.  **Build** the project: `npm install && npm run build`.
3.  **Configure** your AI tool (e.g., Cursor) to point to the build output.
4.  **Open** any project, and indexing starts automatically!

## ⚠️ Known Limitations (v1.0.0)
*   **Tool Set**: Generative AI tools (Planning, Code Review) have been **removed from the interface** in this version to ensure a purely local, deterministic experience. The focus is on robust context retrieval, search, and security scanning.
*   **Initial Download**: The first time you run it, it will download ~200MB of machine learning models. This happens once per machine.

## 📄 License
MIT License - Free for personal and commercial use.
