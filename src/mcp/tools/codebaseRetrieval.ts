/**
 * Layer 3: MCP Interface Layer - Codebase Retrieval Tool
 *
 * PRIMARY tool for semantic codebase searches.
 * Returns JSON (not markdown) for programmatic consumption.
 */

import { ContextServiceClient } from '../serviceClient.js';

export interface CodebaseRetrievalArgs {
  query: string;
  top_k?: number;
}

export interface CodebaseRetrievalResult {
  file: string;
  content: string;
  score: number;
  lines?: string;
  reason: string;
}

export interface CodebaseRetrievalOutput {
  results: CodebaseRetrievalResult[];
  metadata: {
    workspace: string;
    lastIndexed: string | null;
    queryTimeMs: number;
    totalResults: number;
  };
}

export async function handleCodebaseRetrieval(
  args: CodebaseRetrievalArgs,
  serviceClient: ContextServiceClient
): Promise<string> {
  const startTime = Date.now();
  const { query, top_k = 10 } = args;

  // Validate inputs
  if (!query || typeof query !== 'string') {
    throw new Error('Invalid query parameter: must be a non-empty string');
  }

  if (query.length > 1000) {
    throw new Error('Query too long: maximum 1000 characters');
  }

  if (top_k !== undefined && (typeof top_k !== 'number' || top_k < 1 || top_k > 50)) {
    throw new Error('Invalid top_k parameter: must be a number between 1 and 50');
  }

  // Delegate to existing semantic search
  const searchResults = await serviceClient.semanticSearch(query, top_k);
  const status = serviceClient.getIndexStatus();

  const results: CodebaseRetrievalResult[] = searchResults.map((r) => ({
    file: r.path,
    content: r.content,
    score: r.relevanceScore || 0,
    lines: r.lines,
    reason: `Semantic match for: "${query}"`,
  }));

  const output: CodebaseRetrievalOutput = {
    results,
    metadata: {
      workspace: status.workspace,
      lastIndexed: status.lastIndexed,
      queryTimeMs: Date.now() - startTime,
      totalResults: results.length,
    },
  };

  return JSON.stringify(output, null, 2);
}

export const codebaseRetrievalTool = {
  name: 'codebase_retrieval',
  description: `PRIMARY TOOL FOR CODEBASE SEARCH — use this as your FIRST CHOICE for understanding code.

This tool:
- Accepts natural language descriptions of the code you need
- Uses high-recall semantic retrieval over the indexed workspace
- Reflects current disk state (real-time watcher support)
- Returns structured JSON for programmatic use

WHEN TO USE
- You don't know which files contain the information you need
- You want to gather high-level info about a task or symbols before editing
- You need cross-language search results quickly

DO NOT USE (prefer grep/string search)
- Exact string matches of known identifiers or error messages
- Bulk listing of every occurrence of a known symbol`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language description of what you are looking for (e.g., "authentication middleware").',
      },
      top_k: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10, max: 50).',
        default: 10,
      },
    },
    required: ['query'],
  },
};
