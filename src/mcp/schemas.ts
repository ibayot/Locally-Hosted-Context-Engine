/**
 * Zod validation schemas for all MCP tools
 * Replaces unsafe 'as any' casts with runtime validation
 */

import { z } from 'zod';

// ============================================================================
// Core Context Tools
// ============================================================================

export const IndexWorkspaceSchema = z.object({
  force: z.boolean().optional().default(false),
}).strict();

export const SemanticSearchSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  top_k: z.number().int().min(1).max(100).optional().default(10),
  min_relevance: z.number().min(0).max(1).optional().default(0.3),
}).strict();

export const CodebaseRetrievalSchema = z.object({
  query: z.string().min(1),
  top_k: z.number().int().min(1).max(50).optional().default(5),
}).strict();

export const GetContextForPromptSchema = z.object({
  query: z.string().min(1),
  budget: z.number().int().min(1000).max(100000).optional().default(32000),
  include_memories: z.boolean().optional().default(true),
}).strict();

export const EnhancePromptSchema = z.object({
  prompt: z.string().min(1),
  budget: z.number().int().min(1000).max(50000).optional().default(16000),
}).strict();

export const GetFileSchema = z.object({
  path: z.string().min(1),
}).strict();

export const IndexStatusSchema = z.object({}).strict();

export const ReindexWorkspaceSchema = z.object({}).strict();

export const ClearIndexSchema = z.object({}).strict();

export const ToolManifestSchema = z.object({}).strict();

// ============================================================================
// Memory Tools
// ============================================================================

export const AddMemorySchema = z.object({
  content: z.string().min(1).max(5000),
  category: z.enum(['preferences', 'decisions', 'facts']),
  title: z.string().optional(),
}).strict();

export const ListMemoriesSchema = z.object({
  category: z.enum(['preferences', 'decisions', 'facts']).optional(),
}).strict();

// ============================================================================
// Planning Tools
// ============================================================================

export const SavePlanSchema = z.object({
  plan: z.object({
    name: z.string(),
    description: z.string(),
    steps: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
    })),
  }),
  planId: z.string().optional(),
}).strict();

export const LoadPlanSchema = z.object({
  planId: z.string(),
}).strict();

export const ListPlansSchema = z.object({}).strict();

export const DeletePlanSchema = z.object({
  planId: z.string(),
}).strict();

export const VisualizePlanSchema = z.object({
  plan: z.string(),
  diagram_type: z.enum(['dependencies', 'architecture', 'gantt']).optional(),
}).strict();

export const StartStepSchema = z.object({
  planId: z.string(),
  stepId: z.string(),
}).strict();

export const CompleteStepSchema = z.object({
  planId: z.string(),
  stepId: z.string(),
  result: z.string().optional(),
}).strict();

export const FailStepSchema = z.object({
  planId: z.string(),
  stepId: z.string(),
  error: z.string(),
}).strict();

export const ViewProgressSchema = z.object({
  planId: z.string(),
}).strict();

export const ViewHistorySchema = z.object({
  planId: z.string(),
}).strict();

// ============================================================================
// Code Analysis Tools
// ============================================================================

export const FindSymbolSchema = z.object({
  name: z.string().min(1),
  kind: z.string().optional(),
  exact: z.boolean().optional().default(false),
}).strict();

export const DependencyGraphSchema = z.object({
  file: z.string().min(1),
  direction: z.enum(['both', 'imports', 'dependents']).optional().default('both'),
  depth: z.number().int().min(1).max(5).optional().default(2),
}).strict();

export const CodeMetricsSchema = z.object({
  file: z.string().optional(),
  paths: z.array(z.string()).optional(),
  threshold: z.number().optional(),
}).strict();

export const ProjectStructureSchema = z.object({
  max_depth: z.number().int().min(1).max(10).optional().default(3),
  show_files: z.boolean().optional().default(true),
  show_hidden: z.boolean().optional().default(false),
}).strict();

export const FileStatsSchema = z.object({}).strict();

export const GitContextSchema = z.object({
  action: z.enum(['log', 'blame', 'diff_stat', 'status', 'contributors']),
  file: z.string().optional(),
  count: z.number().int().min(1).max(100).optional().default(10),
  branch: z.string().optional(),
}).strict();

// ============================================================================
// Code Review Tools
// ============================================================================

export const RunStaticAnalysisSchema = z.object({
  changed_files: z.array(z.string()).optional(),
  options: z.object({
    analyzers: z.array(z.enum(['tsc', 'semgrep'])).optional(),
    timeout_ms: z.number().optional(),
    max_findings_per_analyzer: z.number().optional(),
    semgrep_args: z.array(z.string()).optional(),
  }).optional(),
}).strict();

export const ScanSecuritySchema = z.object({
  path: z.string().optional(),
}).strict();

export const CheckInvariantsSchema = z.object({
  invariants: z.array(z.string()),
}).strict();

export const ReviewDiffSchema = z.object({
  diff: z.string().min(1),
  context: z.string().optional(),
}).strict();

export const ReviewGitDiffSchema = z.object({
  commit: z.string().optional(),
  branch: z.string().optional(),
}).strict();

// ============================================================================
// Reactive Review Tools
// ============================================================================

export const ReactiveReviewPRSchema = z.object({
  commit_hash: z.string(),
  base_ref: z.string(),
  changed_files: z.string(),
  title: z.string().optional(),
  author: z.string().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  parallel: z.boolean().optional(),
  max_workers: z.number().optional(),
}).strict();

export const GetReviewStatusSchema = z.object({
  session_id: z.string(),
}).strict();

export const PauseReviewSchema = z.object({
  session_id: z.string(),
}).strict();

export const ResumeReviewSchema = z.object({
  session_id: z.string(),
}).strict();

export const GetReviewTelemetrySchema = z.object({
  session_id: z.string(),
}).strict();

export const ScrubSecretsSchema = z.object({
  content: z.string().min(1),
  show_start: z.number().optional(),
  show_end: z.number().optional(),
}).strict();

// ============================================================================
// BMAD Tools
// ============================================================================

export const ScaffoldBMADSchema = z.object({
  goal: z.string(),
  output_dir: z.string().optional().default('.bmad'),
}).strict();

export const GetBMADGuidelinesSchema = z.object({
  persona: z.enum([
    'product_owner',
    'analyst',
    'ui_ux_designer',
    'architect',
    'security_engineer',
    'scrum_master',
    'developer',
    'qa_lead',
    'devops'
  ]).optional(),
}).strict();

// ============================================================================
// GitHub Integration Tools
// ============================================================================

export const GetGitHubIssuesSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  limit: z.number().int().min(1).max(100).optional().default(30),
}).strict();

export const GetGitHubIssueSchema = z.object({
  number: z.number().int().min(1),
}).strict();

export const SearchGitHubIssuesSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(20),
}).strict();

export const GetGitHubPRsSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('open'),
  limit: z.number().int().min(1).max(100).optional().default(30),
}).strict();

// ============================================================================
// Type inference helpers
// ============================================================================

export type IndexWorkspaceArgs = z.infer<typeof IndexWorkspaceSchema>;
export type SemanticSearchArgs = z.infer<typeof SemanticSearchSchema>;
export type CodebaseRetrievalArgs = z.infer<typeof CodebaseRetrievalSchema>;
export type GetContextForPromptArgs = z.infer<typeof GetContextForPromptSchema>;
export type EnhancePromptArgs = z.infer<typeof EnhancePromptSchema>;
export type GetFileArgs = z.infer<typeof GetFileSchema>;
export type AddMemoryArgs = z.infer<typeof AddMemorySchema>;
export type ListMemoriesArgs = z.infer<typeof ListMemoriesSchema>;
export type SavePlanArgs = z.infer<typeof SavePlanSchema>;
export type LoadPlanArgs = z.infer<typeof LoadPlanSchema>;
export type DeletePlanArgs = z.infer<typeof DeletePlanSchema>;
export type FindSymbolArgs = z.infer<typeof FindSymbolSchema>;
export type DependencyGraphArgs = z.infer<typeof DependencyGraphSchema>;
export type CodeMetricsArgs = z.infer<typeof CodeMetricsSchema>;
export type ProjectStructureArgs = z.infer<typeof ProjectStructureSchema>;
export type GitContextArgs = z.infer<typeof GitContextSchema>;
export type RunStaticAnalysisArgs = z.infer<typeof RunStaticAnalysisSchema>;
export type ScanSecurityArgs = z.infer<typeof ScanSecuritySchema>;
export type ReviewDiffArgs = z.infer<typeof ReviewDiffSchema>;
export type ReviewGitDiffArgs = z.infer<typeof ReviewGitDiffSchema>;
export type ReactiveReviewPRArgs = z.infer<typeof ReactiveReviewPRSchema>;
export type ScaffoldBMADArgs = z.infer<typeof ScaffoldBMADSchema>;
export type GetBMADGuidelinesArgs = z.infer<typeof GetBMADGuidelinesSchema>;
