import { envBool } from './env.js';

export interface FeatureFlags {
  /** Persist per-file index state store (JSON sidecar). */
  index_state_store: boolean;
  /** Skip indexing unchanged files (requires index_state_store). */
  skip_unchanged_indexing: boolean;
  /** Normalize EOL when hashing for incremental indexing. */
  hash_normalize_eol: boolean;
  /** Enable in-process metrics collection (Prometheus-format rendering). */
  metrics: boolean;
  /** Expose /metrics on the HTTP server when --http is enabled. */
  http_metrics: boolean;
  
  // Phase 2: Semantic Pipeline Upgrades
  /** Use SQLite for vector storage instead of JSON. */
  use_sqlite_storage: boolean;
  /** Use HNSW index for fast approximate nearest neighbor search. */
  use_hnsw_index: boolean;
  /** Use hierarchical chunking (file → class → function → block). */
  use_hierarchical_chunks: boolean;
  /** Use worker threads for parallel embedding generation. */
  use_worker_threads: boolean;
  
  // Phase 3: Knowledge Graph
  /** Build and maintain knowledge graph of imports/exports/calls. */
  enable_knowledge_graph: boolean;
  /** Include dependency-aware context expansion in search results. */
  dependency_aware_context: boolean;
  
  // Phase 5: External Integrations
  /** Enable GitHub API integration (requires git remote). */
  enable_github_integration: boolean;
}

export function getFeatureFlagsFromEnv(): FeatureFlags {
 return {
   index_state_store: envBool('CE_INDEX_STATE_STORE', false),
   skip_unchanged_indexing: envBool('CE_SKIP_UNCHANGED_INDEXING', false),
   hash_normalize_eol: envBool('CE_HASH_NORMALIZE_EOL', false),
   metrics: envBool('CE_METRICS', false),
   http_metrics: envBool('CE_HTTP_METRICS', false),
   
   // Phase 2: Default enabled for new semantic capabilities
   use_sqlite_storage: envBool('CE_USE_SQLITE', true),
   use_hnsw_index: envBool('CE_USE_HNSW', true),
   use_hierarchical_chunks: envBool('CE_HIERARCHICAL_CHUNKS', true),
   use_worker_threads: envBool('CE_WORKER_THREADS', true),
   
   // Phase 3: Default enabled
   enable_knowledge_graph: envBool('CE_KNOWLEDGE_GRAPH', true),
   dependency_aware_context: envBool('CE_DEPENDENCY_CONTEXT', true),
   
   // Phase 5: Opt-in (requires git remote + optional GITHUB_TOKEN)
   enable_github_integration: envBool('CE_GITHUB_INTEGRATION', false),
 };
}

export const FEATURE_FLAGS: FeatureFlags = getFeatureFlagsFromEnv();

export function featureEnabled(name: keyof FeatureFlags): boolean {
  return FEATURE_FLAGS[name];
}
