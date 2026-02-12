/**
 * Layer 3: MCP Interface Layer - Server
 *
 * Main MCP server that exposes tools to coding agents
 *
 * Architecture:
 * - Stateless adapter between MCP protocol and service layer
 * - No business logic
 * - No retrieval logic
 * - Pure protocol translation
 *
 * Features:
 * - Graceful shutdown handling (SIGTERM, SIGINT)
 * - Request logging for debugging
 * - Proper error formatting for agents
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import * as crypto from 'crypto';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

import { ContextServiceClient } from './serviceClient.js';
import { semanticSearchTool, handleSemanticSearch } from './tools/search.js';
import { getFileTool, handleGetFile } from './tools/file.js';
import { getContextTool, handleGetContext } from './tools/context.js';
import { enhancePromptTool, handleEnhancePrompt } from './tools/enhance.js';
import { indexWorkspaceTool, handleIndexWorkspace } from './tools/index.js';
import { indexStatusTool, handleIndexStatus } from './tools/status.js';
import {
  reindexWorkspaceTool,
  clearIndexTool,
  handleReindexWorkspace,
  handleClearIndex,
} from './tools/lifecycle.js';
import { toolManifestTool, handleToolManifest } from './tools/manifest.js';
import { codebaseRetrievalTool, handleCodebaseRetrieval } from './tools/codebaseRetrieval.js';
import {
  createPlanTool,
  refinePlanTool,
  visualizePlanTool,
  executePlanTool,
  handleCreatePlan,
  handleRefinePlan,
  handleVisualizePlan,
  handleExecutePlan,
} from './tools/plan.js';
import {
  addMemoryTool,
  listMemoriesTool,
  handleAddMemory,
  handleListMemories,
} from './tools/memory.js';
import {
  planManagementTools,
  initializePlanManagementServices,
  handleSavePlan,
  handleLoadPlan,
  handleListPlans,
  handleDeletePlan,
  handleStartStep,
  handleCompleteStep,
  handleViewProgress,
  handleViewHistory,
} from './tools/planManagement.js';
// Code review tools (LLM-powered, disabled)
// import { reviewChangesTool, handleReviewChanges } from './tools/codeReview.js';
// import { reviewGitDiffTool, handleReviewGitDiff } from './tools/gitReview.js';
// import { reviewDiffTool, handleReviewDiff } from './tools/reviewDiff.js';
// import { reviewAutoTool, handleReviewAuto } from './tools/reviewAuto.js';
// import { checkInvariantsTool, handleCheckInvariants } from './tools/checkInvariants.js';
import { runStaticAnalysisTool, handleRunStaticAnalysis } from './tools/staticAnalysis.js';
import {
  reactiveReviewTools,
  handleReactiveReviewPR,
  handleGetReviewStatus,
  handlePauseReview,
  handleResumeReview,
  handleGetReviewTelemetry,
  handleScrubSecrets,
  scrubSecretsTool,
} from './tools/reactiveReview.js';
import { getBmadGuidelinesTool, handleGetBmadGuidelines } from './tools/bmad.js';
import { scanSecurityTool, handleScanSecurity } from './tools/security.js';
import { fileStatsTool, handleFileStats } from './tools/fileStats.js';
import { projectStructureTool, handleProjectStructure } from './tools/projectStructure.js';
import { gitContextTool, handleGitContext } from './tools/gitContext.js';
import { findSymbolTool, handleFindSymbol } from './tools/symbolIndex.js';
import { dependencyGraphTool, handleDependencyGraph } from './tools/dependencyGraph.js';
import { codeMetricsTool, handleCodeMetrics } from './tools/codeMetrics.js';
// Removed tools (imports kept commented for reference)
// import { findTodosTool, handleFindTodos } from './tools/todoTracker.js';
// import { findDuplicatesTool, handleFindDuplicates } from './tools/duplicateDetector.js';
// import { ollamaStatusTool, handleOllamaStatus } from './tools/ollamaStatus.js';
// import { bmadWorkflowTool, handleBmadWorkflow } from './tools/bmadWorkflow.js';
import { scaffoldBmadTool, handleScaffoldBmad } from './tools/scaffoldBmad.js';
import { FileWatcher } from '../watcher/index.js';

export class ContextEngineMCPServer {
  private server: Server;
  private serviceClient: ContextServiceClient;
  private isShuttingDown = false;
  private workspacePath: string;
  private fileWatcher?: FileWatcher;
  private enableWatcher: boolean;
  private reindexOnDelete: boolean;
  private reindexDebounceMs: number;
  private reindexCooldownMs: number;
  private reindexDeleteBurstThreshold: number;
  private deleteBurstCount = 0;
  private pendingReindexTimer: NodeJS.Timeout | null = null;
  private reindexInFlight: Promise<void> | null = null;
  private lastReindexAt: number | null = null;

  constructor(
    workspacePath: string,
    serverName: string = 'context-engine',
    options?: { enableWatcher?: boolean; watchDebounceMs?: number }
  ) {
    this.workspacePath = workspacePath;
    this.serviceClient = new ContextServiceClient(workspacePath);

    // Initialize Phase 2 plan management services
    initializePlanManagementServices(workspacePath);
    this.enableWatcher = options?.enableWatcher ?? false;
    this.reindexOnDelete = (process.env.CE_WATCHER_REINDEX_ON_DELETE ?? 'true') === 'true';
    this.reindexDebounceMs = Math.max(250, Number(process.env.CE_WATCHER_REINDEX_DEBOUNCE_MS ?? '2000') || 2000);
    this.reindexCooldownMs = Math.max(0, Number(process.env.CE_WATCHER_REINDEX_COOLDOWN_MS ?? '60000') || 60000);
    this.reindexDeleteBurstThreshold = Math.max(1, Number(process.env.CE_WATCHER_DELETE_BURST_THRESHOLD ?? '10') || 10);

    this.server = new Server(
      {
        name: serverName,
        version: pkg.version,
      },
      {
        capabilities: {
          tools: { listChanged: true },
        },
      }
    );

    this.setupHandlers();
    this.setupGracefulShutdown();

    if (this.enableWatcher) {
      // Get ignore patterns from serviceClient to sync with indexing behavior
      const ignorePatterns = this.serviceClient.getIgnorePatterns();
      const excludedDirs = this.serviceClient.getExcludedDirectories();

      // Normalize workspace path for pattern matching (use forward slashes)
      const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/');

      // Convert patterns to chokidar-compatible format
      // Chokidar accepts strings, RegExp, or functions
      const watcherIgnored: (string | RegExp)[] = [
        // Exclude directories (match anywhere in path)
        ...excludedDirs.map(dir => `**/${dir}/**`),
        // Include gitignore/contextignore patterns
        ...ignorePatterns.map(pattern => {
          // Handle root-anchored patterns (e.g., /.env should match only at workspace root)
          if (pattern.startsWith('/')) {
            // For root-anchored patterns, prepend workspace path for absolute matching
            // Chokidar uses absolute paths, so we need to match against workspace root
            return `${normalizedWorkspacePath}${pattern}`;
          }
          // Handle directory-only patterns
          if (pattern.endsWith('/')) {
            return `**/${pattern}**`;
          }
          // Match anywhere in path
          return `**/${pattern}`;
        }),
      ];

      console.error(`[watcher] Loaded ${watcherIgnored.length} ignore patterns`);

      this.fileWatcher = new FileWatcher(
        workspacePath,
        {
          onBatch: async (changes) => {
            const deleted = changes.filter((c) => c.type === 'unlink');
            const paths = changes.filter((c) => c.type !== 'unlink').map((c) => c.path);

            if (deleted.length > 0) {
              this.onFilesDeleted(deleted.length);
            }

            if (paths.length === 0) return;
            try {
              await this.serviceClient.indexFiles(paths);
            } catch (error) {
              console.error('[watcher] Incremental indexing failed:', error);
            }
          },
        },
        {
          debounceMs: options?.watchDebounceMs ?? 500,
          ignored: watcherIgnored,
        }
      );
      this.fileWatcher.start();
    }
  }

  private onFilesDeleted(count: number): void {
    if (!this.reindexOnDelete) return;
    this.deleteBurstCount += count;

    // Large bursts: schedule quickly; otherwise debounce.
    const dueIn = this.deleteBurstCount >= this.reindexDeleteBurstThreshold
      ? 250
      : Math.max(250, this.reindexDebounceMs);

    if (this.pendingReindexTimer) {
      clearTimeout(this.pendingReindexTimer);
      this.pendingReindexTimer = null;
    }

    this.pendingReindexTimer = setTimeout(() => {
      this.pendingReindexTimer = null;
      void this.maybeReindexAfterDeletes();
    }, dueIn);
  }

  private async maybeReindexAfterDeletes(): Promise<void> {
    if (!this.reindexOnDelete) return;
    if (this.isShuttingDown) return;
    if (this.deleteBurstCount === 0) return;

    // Avoid reindex loops: only do it once per cooldown window.
    if (this.lastReindexAt && Date.now() - this.lastReindexAt < this.reindexCooldownMs) {
      return;
    }

    // If we're already reindexing, don't start another.
    if (this.reindexInFlight) return;

    // If indexer is busy, retry shortly.
    const status = this.serviceClient.getIndexStatus();
    if (status.status === 'indexing') {
      this.onFilesDeleted(0);
      return;
    }

    const burstCount = this.deleteBurstCount;
    this.deleteBurstCount = 0;

    console.error(`[watcher] Detected ${burstCount} deletions; scheduling full reindex to prevent stale results`);
    this.lastReindexAt = Date.now();

    this.reindexInFlight = this.serviceClient.indexWorkspace()
      .then(() => { })
      .catch((e) => {
        console.error('[watcher] Background reindex after deletions failed:', e);
      })
      .finally(() => {
        this.reindexInFlight = null;
      });

    await this.reindexInFlight;
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.error(`\nReceived ${signal}, shutting down gracefully...`);

      try {
        // Clear caches
        this.serviceClient.clearCache();

        // Stop watcher if running
        if (this.fileWatcher) {
          await this.fileWatcher.stop();
        }

        // Close server connection
        await this.server.close();

        console.error('Server shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      // Don't exit on unhandled rejection, just log
    });
  }

  private setupHandlers(): void {
    // Filter plan management tools to keep only core ones (27 total tools)
    const corePlanTools = planManagementTools.filter(tool =>
      !['compare_plan_versions', 'rollback_plan', 'fail_step', 'request_approval', 'respond_approval'].includes(tool.name)
    );

    // Filter reactive review tools - scrubSecrets listed separately, validateContent removed
    const coreReviewTools = reactiveReviewTools.filter(tool =>
      !['scrub_secrets', 'validate_content'].includes(tool.name)
    );

    // List available tools (27 core tools - pruned from 39)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // === CORE CONTEXT (6) ===
          indexWorkspaceTool,
          codebaseRetrievalTool,
          semanticSearchTool,
          getFileTool,
          getContextTool,
          toolManifestTool,
          // === INDEX MANAGEMENT (3) ===
          indexStatusTool,
          reindexWorkspaceTool,
          clearIndexTool,
          // === MEMORY (2) ===
          addMemoryTool,
          listMemoriesTool,
          // === PLANNING (9) ===
          visualizePlanTool,
          ...corePlanTools,
          // === CODE ANALYSIS (8) ===
          runStaticAnalysisTool,
          scanSecurityTool,
          fileStatsTool,
          projectStructureTool,
          gitContextTool,
          findSymbolTool,
          dependencyGraphTool,
          codeMetricsTool,
          // === REACTIVE REVIEW (6) ===
          ...coreReviewTools,
          scrubSecretsTool,
          // === BMAD (2) ===
          getBmadGuidelinesTool,
          scaffoldBmadTool,
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();

      // Log request (to stderr so it doesn't interfere with stdio transport)
      console.error(`[${new Date().toISOString()}] Tool: ${name}`);

      try {
        let result: string;

        switch (name) {
          case 'index_workspace':
            result = await handleIndexWorkspace(args as any, this.serviceClient);
            break;

          case 'reindex_workspace':
            result = await handleReindexWorkspace(args as any, this.serviceClient);
            break;

          case 'clear_index':
            result = await handleClearIndex(args as any, this.serviceClient);
            break;

          case 'index_status':
            result = await handleIndexStatus(args as any, this.serviceClient);
            break;

          case 'tool_manifest':
            result = await handleToolManifest(args as any, this.serviceClient);
            break;

          case 'codebase_retrieval':
            result = await handleCodebaseRetrieval(args as any, this.serviceClient);
            break;

          case 'semantic_search':
            result = await handleSemanticSearch(args as any, this.serviceClient);
            break;

          case 'get_file':
            result = await handleGetFile(args as any, this.serviceClient);
            break;

          case 'get_context_for_prompt':
            result = await handleGetContext(args as any, this.serviceClient);
            break;

          /*
          case 'enhance_prompt':
            result = await handleEnhancePrompt(args as any, this.serviceClient);
            break;
          */

          // Memory tools (v1.4.1)
          case 'add_memory':
            result = await handleAddMemory(args as any, this.serviceClient);
            break;

          case 'list_memories':
            result = await handleListMemories(args as any, this.serviceClient);
            break;

          // Planning tools - LLM-powered via Ollama (Disabled)
          /*
          case 'create_plan':
            result = await handleCreatePlan(args as any, this.serviceClient);
            break;

          case 'refine_plan':
            result = await handleRefinePlan(args as any, this.serviceClient);
            break;
          */

          case 'visualize_plan':
            result = await handleVisualizePlan(args as any, this.serviceClient);
            break;

          /*
          case 'execute_plan':
            result = await handleExecutePlan(args as any, this.serviceClient);
            break;
          */

          // Plan management tools (Phase 2) - Pure I/O, re-enabled
          case 'save_plan':
            result = await handleSavePlan(args as Record<string, unknown>);
            break;

          case 'load_plan':
            result = await handleLoadPlan(args as Record<string, unknown>);
            break;

          case 'list_plans':
            result = await handleListPlans(args as Record<string, unknown>);
            break;

          case 'delete_plan':
            result = await handleDeletePlan(args as Record<string, unknown>);
            break;

          case 'start_step':
            result = await handleStartStep(args as Record<string, unknown>);
            break;

          case 'complete_step':
            result = await handleCompleteStep(args as Record<string, unknown>);
            break;

          case 'view_progress':
            result = await handleViewProgress(args as Record<string, unknown>);
            break;

          case 'view_history':
            result = await handleViewHistory(args as Record<string, unknown>);
            break;

          // Code Review tools - LLM-powered via Ollama (Disabled)
          /*
          case 'review_changes':
            result = await handleReviewChanges(args as any, this.serviceClient);
            break;

          case 'review_git_diff':
            result = await handleReviewGitDiff(args as any, this.serviceClient);
            break;

          case 'review_diff':
            result = await handleReviewDiff(args as any, this.serviceClient);
            break;

          case 'review_auto':
            result = await handleReviewAuto(args as any, this.serviceClient);
            break;
          */

          // check_invariants removed (use linters instead)

          case 'run_static_analysis':
            result = await handleRunStaticAnalysis(args as any, this.serviceClient);
            break;

          // Reactive Review tools
          case 'reactive_review_pr':
            result = await handleReactiveReviewPR(args as any, this.serviceClient);
            break;

          case 'get_review_status':
            result = await handleGetReviewStatus(args as any, this.serviceClient);
            break;

          case 'pause_review':
            result = await handlePauseReview(args as any, this.serviceClient);
            break;

          case 'resume_review':
            result = await handleResumeReview(args as any, this.serviceClient);
            break;

          case 'get_review_telemetry':
            result = await handleGetReviewTelemetry(args as any, this.serviceClient);
            break;

          case 'scrub_secrets':
            result = await handleScrubSecrets(args as any);
            break;

          // validate_content removed (use scan_security instead)

          // Ollama LLM status
          /*
          case 'ollama_status':
            result = await handleOllamaStatus(args as any, this.serviceClient);
            break;
          */

          // BMAD workflow
          /*
          case 'run_bmad':
            result = await handleBmadWorkflow(args as any, this.serviceClient);
            break;
          */

          case 'scaffold_bmad':
            result = await handleScaffoldBmad(args as any, this.serviceClient);
            break;

          // New Tools (v3.0)
          case 'get_bmad_guidelines':
            result = await handleGetBmadGuidelines(args as any);
            break;

          case 'scan_security':
            result = await handleScanSecurity(args as any, this.workspacePath);
            break;

          // New Tools (v4.0) - Local utilities
          // find_todos removed (trivial grep)

          case 'file_statistics':
            result = await handleFileStats(args as any, this.serviceClient);
            break;

          case 'project_structure':
            result = await handleProjectStructure(args as any, this.serviceClient);
            break;

          case 'git_context':
            result = await handleGitContext(args as any, this.serviceClient);
            break;

          // New Tools (v4.1) - AST-powered
          case 'find_symbol':
            result = await handleFindSymbol(args as any, this.serviceClient);
            break;

          case 'dependency_graph':
            result = await handleDependencyGraph(args as any, this.serviceClient);
            break;

          case 'code_metrics':
            result = await handleCodeMetrics(args as any, this.serviceClient);
            break;

          // find_duplicates removed (low value)

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        const elapsed = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] Tool ${name} completed in ${elapsed}ms`);

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[${new Date().toISOString()}] Tool ${name} failed after ${elapsed}ms: ${errorMessage}`);

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server.
   * @param options.transport - 'stdio' (default) or 'http' (StreamableHTTP, frees stdio for Antigravity).
   * @param options.port      - HTTP port when transport is 'http' (default 3334).
   */
  async run(options?: { transport?: 'stdio' | 'http'; port?: number }): Promise<void> {
    const transportType = options?.transport || 'stdio';

    if (transportType === 'http') {
      // ── Streamable HTTP transport ───────────────────────────────
      // Uses HTTP POST/GET instead of stdio → Antigravity messaging stays clear.
      const { createMcpExpressApp } = await import('@modelcontextprotocol/sdk/server/express.js');
      const app = createMcpExpressApp();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });
      await this.server.connect(transport);

      // Route all MCP traffic through /mcp
      app.all('/mcp', async (req: any, res: any) => {
        await transport.handleRequest(req, res, req.body);
      });

      const port = options?.port || 3334;
      app.listen(port, () => {
        this.printBanner('http', port);
      });
    } else {
      // ── Default stdio transport ─────────────────────────────────
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.printBanner('stdio');
    }
  }

  private printBanner(transport: string, port?: number): void {
    console.error('='.repeat(60));
    console.error(`Context Engine MCP Server v${pkg.version}`);
    console.error('='.repeat(60));
    console.error(`Workspace : ${this.workspacePath}`);
    if (transport === 'http') {
      console.error(`Transport : StreamableHTTP on port ${port}`);
      console.error(`Endpoint  : http://localhost:${port}/mcp`);
    } else {
      console.error('Transport : stdio');
    }
    console.error(`Watcher   : ${this.enableWatcher ? 'enabled' : 'disabled'}`);
    console.error('');
    console.error('Available tools (27 core):');
    console.error('  Core     : index_workspace, semantic_search, get_context_for_prompt, get_file, codebase_retrieval, tool_manifest');
    console.error('  Index    : index_status, reindex_workspace, clear_index');
    console.error('  Memory   : add_memory, list_memories');
    console.error('  Planning : visualize_plan, save/load/list/delete_plan, start/complete_step, view_progress/history');
    console.error('  Analysis : run_static_analysis, scan_security, file_stats, project_structure, git_context, find_symbol, dependency_graph, code_metrics');
    console.error('  Review   : reactive_review_pr, get_review_status, pause/resume_review, get_review_telemetry, scrub_secrets');
    console.error('  BMAD     : scaffold_bmad, get_bmad_guidelines');
    console.error('');
    console.error('Server ready. Waiting for requests...');
    console.error('='.repeat(60));
  }

  async indexWorkspace(): Promise<void> {
    await this.serviceClient.indexWorkspace();
  }

  /**
   * Get the workspace path
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Get the service client instance.
   * Used by HTTP server to share the same service client.
   */
  getServiceClient(): ContextServiceClient {
    return this.serviceClient;
  }
}
