# Context Engine - API Reference

## MCP Tools Reference

This document provides detailed API specifications for all 20+ MCP tools exposed by Context Engine.

## Table of Contents

1. [Context & Search Tools](#context--search-tools)
2. [Review Tools](#review-tools)
3. [Planning Tools](#planning-tools)
4. [Execution Tools](#execution-tools)
5. [Reactive Review Tools](#reactive-review-tools)
6. [Persistence Tools](#persistence-tools)
7. [Utility Tools](#utility-tools)

---

## Context & Search Tools

### 1. `semantic_search`

**Description**: Find code snippets by semantic meaning using embeddings.

**Input Schema**:
```typescript
{
  query: string;              // Natural language search query
  top_k?: number;             // Number of results (default: 5)
  file_filter?: string[];     // Optional file path filters
  min_score?: number;         // Minimum relevance score (0-1)
}
```

**Output**:
```typescript
{
  results: Array<{
    file: string;             // File path
    content: string;          // Code snippet
    score: number;            // Relevance score (0-1)
    line_start: number;       // Starting line number
    line_end: number;         // Ending line number
  }>;
  query: string;              // Original query
  total_results: number;      // Total matches found
}
```

**Example**:
```json
{
  "name": "semantic_search",
  "arguments": {
    "query": "authentication logic",
    "top_k": 5
  }
}
```

---

### 2. `get_file`

**Description**: Retrieve complete file contents with metadata.

**Input Schema**:
```typescript
{
  path: string;               // File path relative to workspace
  include_metadata?: boolean; // Include git info (default: true)
}
```

**Output**:
```typescript
{
  path: string;               // File path
  content: string;            // Full file contents
  size: number;               // File size in bytes
  lines: number;              // Total line count
  metadata?: {
    last_modified: string;    // ISO timestamp
    git_status?: string;      // Git status (modified, staged, etc.)
  };
}
```

---

### 3. `get_context_for_prompt`

**Description**: Primary context enhancement tool - bundles relevant code for AI prompts.

**Input Schema**:
```typescript
{
  query: string;              // Context query
  max_files?: number;         // Max files to include (default: 5)
  max_tokens?: number;        // Token budget (default: 8000)
  include_dependencies?: boolean; // Include imports (default: true)
  file_hints?: string[];      // Priority files
}
```

**Output**:
```typescript
{
  context: string;            // Formatted context bundle
  files_included: string[];   // List of included files
  tokens_used: number;        // Estimated token count
  truncated: boolean;         // Whether context was truncated
  metadata: {
    query: string;
    strategy: string;         // Context bundling strategy used
    timestamp: string;
  };
}
```

---

### 4. `codebase_retrieval`

**Description**: Advanced semantic search with filtering and ranking.

**Input Schema**:
```typescript
{
  query: string;              // Search query
  options?: {
    top_k?: number;           // Results limit
    file_types?: string[];    // Filter by extension (.ts, .js, etc.)
    exclude_paths?: string[]; // Paths to exclude
    include_tests?: boolean;  // Include test files (default: false)
  };
}
```

**Output**: Similar to `semantic_search` with additional filtering metadata.

---

### 5. `git_commit_retrieval`

**Description**: Search commit history for relevant changes.

**Input Schema**:
```typescript
{
  query: string;              // Search query
  max_commits?: number;       // Commit limit (default: 10)
  since?: string;             // ISO date or relative (e.g., "1 week ago")
  author?: string;            // Filter by author
}
```

**Output**:
```typescript
{
  commits: Array<{
    sha: string;              // Commit hash
    message: string;          // Commit message
    author: string;           // Author name
    date: string;             // ISO timestamp
    files_changed: string[];  // Modified files
    relevance_score: number;  // Match score (0-1)
  }>;
  total_found: number;
}
```

---

### 6. `get_workspace_info`

**Description**: Get workspace metadata and health status.

**Input Schema**: None

**Output**:
```typescript
{
  workspace_path: string;     // Absolute workspace path
  git_root?: string;          // Git repository root
  branch?: string;            // Current git branch
  total_files: number;        // Indexed file count
  index_status: {
    healthy: boolean;
    last_indexed: string;     // ISO timestamp
    index_size: number;       // Index size in bytes
  };
  cache_stats: {
    hit_rate: number;         // Cache hit rate (0-1)
    size: number;             // Cache entry count
    commit_keyed: boolean;    // Commit-based invalidation enabled
  };
}
```

---

## Review Tools

### 7. `review_diff`

**Description**: Enterprise-grade code review with multi-stage analysis.

**Input Schema**:
```typescript
{
  diff: string;               // Git diff (unified format)
  workspace_path?: string;    // For static analysis
  changed_files?: string[];   // Optional file list
  options?: {
    confidence_threshold?: number;     // Min confidence (0-1, default: 0.7)
    max_findings?: number;             // Limit findings (default: 50)
    categories?: string[];             // Filter categories
    fail_on_severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    fail_on_invariant_ids?: string[];  // Fail on specific rules
    allowlist_finding_ids?: string[];  // Suppress findings
    
    // Static analysis
    enable_static_analysis?: boolean;  // Run tsc/semgrep (default: false)
    static_analyzers?: ('tsc' | 'semgrep')[];
    static_analysis_timeout_ms?: number; // Default: 60000
    
    // LLM analysis
    enable_llm_review?: boolean;       // Run LLM passes (default: false)
    two_pass?: boolean;                // Structural + detailed (default: true)
    llm_risk_threshold?: number;       // Min risk for LLM (1-5, default: 3)
    custom_instructions?: string;      // Additional context
    
    // Output formats
    include_sarif?: boolean;           // SARIF output
    include_markdown?: boolean;        // GitHub markdown
  };
}
```

**Output**:
```typescript
{
  run_id: string;             // Unique review ID
  risk_score: number;         // Overall risk (1-5)
  classification: 'feature' | 'bugfix' | 'refactor' | 'infra' | 'docs';
  hotspots: Array<{
    file: string;
    reason: string;
    risk_contribution: number;
  }>;
  summary: {
    total_findings: number;
    by_severity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
    by_category: { [category: string]: number };
    should_fail: boolean;
  };
  findings: Array<{
    id: string;               // Unique finding ID
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;         // security, performance, maintainability, etc.
    confidence: number;       // Confidence score (0-1)
    title: string;            // Short description
    description: string;      // Detailed explanation
    file: string;             // Affected file
    line: number;             // Line number
    snippet?: string;         // Code snippet
    impact: string;           // Impact description
    recommendation: string;   // Fix suggestion
    suggested_patch?: string; // Automated fix (if available)
  }>;
  should_fail: boolean;       // CI/CD failure recommendation
  fail_reasons: string[];     // Reasons for failure
  stats: {
    files_changed: number;
    lines_added: number;
    lines_removed: number;
    duration_ms: number;
    deterministic_checks_executed: number;
    invariants_executed?: number;
    static_analyzers_executed?: number;
    llm_passes_executed?: number;
    llm_findings_added?: number;
    llm_skipped_reason?: string;
    timings_ms?: {
      preflight?: number;
      invariants?: number;
      static_analysis?: number;
      context_fetch?: number;
      secrets_scrub?: number;
      llm_structural?: number;
      llm_detailed?: number;
    };
  };
  metadata: {
    reviewed_at: string;      // ISO timestamp
    tool_version: string;     // Context Engine version
    warnings: string[];       // Non-fatal warnings
    llm_model?: string;       // LLM model used (if applicable)
  };
  sarif?: object;             // SARIF format (if requested)
  markdown?: string;          // GitHub markdown (if requested)
}
```

**Example**:
```json
{
  "name": "review_diff",
  "arguments": {
    "diff": "diff --git a/src/auth.ts b/src/auth.ts\n...",
    "workspace_path": "/path/to/project",
    "options": {
      "enable_static_analysis": true,
      "static_analyzers": ["tsc"],
      "enable_llm_review": true,
      "confidence_threshold": 0.8,
      "fail_on_severity": "HIGH"
    }
  }
}
```

---

### 8. `run_static_analysis`

**Description**: Run local static analyzers (TypeScript, Semgrep) independently.

**Input Schema**:
```typescript
{
  changed_files?: string[];   // Files to analyze
  options?: {
    analyzers?: ('tsc' | 'semgrep')[];  // Default: ['tsc']
    timeout_ms?: number;                // Default: 60000
    max_findings_per_analyzer?: number; // Default: 20
    semgrep_args?: string[];            // Additional semgrep flags
  };
}
```

**Output**:
```typescript
{
  success: boolean;
  analyzers: string[];        // Analyzers run
  warnings: string[];         // Non-fatal warnings
  results: Array<{
    analyzer: string;
    duration_ms: number;
    findings: Finding[];      // Same format as review_diff findings
    skipped_reason?: string;
  }>;
  findings: Finding[];        // All findings combined
}
```

---

### 9. `check_invariants`

**Description**: Check custom rules from `.review-invariants.yml`.

**Input Schema**:
```typescript
{
  diff: string;               // Git diff
  workspace_path?: string;    // For invariants file lookup
  invariants_path?: string;   // Custom path (default: .review-invariants.yml)
}
```

**Output**:
```typescript
{
  success: boolean;
  findings: Finding[];        // Invariant violations
  checked_invariants: number; // Total rules checked
  warnings: string[];
}
```

**Invariants File Format**:
```yaml
security:
  - id: SEC001
    rule: "Description of the rule"
    paths: ["src/**"]
    severity: CRITICAL
    category: security
    action: deny | when_require | warn
    deny:
      regex:
        pattern: "\\beval\\("
    # OR
    when:
      regex:
        pattern: "req\\.user"
    require:
      regex:
        pattern: "requireAuth\\("
```

---

### 10. `get_review_telemetry`

**Description**: Get performance metrics for review operations.

**Input Schema**:
```typescript
{
  session_id?: string;        // Optional session filter
}
```

**Output**:
```typescript
{
  success: boolean;
  session_id?: string;
  telemetry: {
    start_time: string;
    elapsed_ms: number;
    tokens_used: number;
    cache_hit_rate: number;
    last_activity_ms?: number;
    appears_stalled?: boolean;
  };
  cache_stats: {
    hit_rate: number;
    total_entries: number;
    commit_keyed: boolean;
  };
  reactive_config: {
    max_concurrent_steps: number;
    step_timeout_ms: number;
    max_retries: number;
    session_timeout_ms: number;
  };
}
```

---

## Planning Tools

### 11. `generate_plan`

**Description**: Generate AI-powered execution plan with dependency analysis.

**Input Schema**:
```typescript
{
  goal: string;               // High-level goal description
  context?: string;           // Additional context
  constraints?: string[];     // Constraints to consider
  max_steps?: number;         // Step limit (default: 20)
}
```

**Output**:
```typescript
{
  id: string;                 // Unique plan ID
  version: number;            // Plan version
  created_at: string;         // ISO timestamp
  updated_at: string;
  goal: string;
  scope: {
    included: string[];       // In-scope items
    excluded: string[];       // Out-of-scope items
    assumptions: string[];
    constraints: string[];
  };
  mvp_features: Array<{
    name: string;
    description: string;
    steps: number[];          // Step numbers
  }>;
  nice_to_have_features: Array<{
    name: string;
    description: string;
    steps: number[];
  }>;
  steps: Array<{
    number: number;
    description: string;
    type: 'file_edit' | 'file_create' | 'command' | 'review';
    dependencies: number[];   // Prerequisite steps
    estimated_duration_ms?: number;
    files_affected?: string[];
  }>;
  dependencies: {
    [stepNumber: number]: number[];  // Dependency graph
  };
  architecture: {
    notes: string;
    patterns_used: string[];
    diagrams: string[];       // Mermaid diagrams
  };
  risks: Array<{
    issue: string;
    mitigation: string;
    likelihood: 'low' | 'medium' | 'high';
    impact: string;
  }>;
}
```

---

### 12. `get_plan_status`

**Description**: Get execution status for a plan.

**Input Schema**:
```typescript
{
  plan_id: string;
}
```

**Output**:
```typescript
{
  plan_id: string;
  status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';
  progress: {
    completed_steps: number;
    total_steps: number;
    percentage: number;
  };
  current_steps: number[];    // Currently executing
  ready_steps: number[];      // Ready to execute
  blocked_steps: number[];    // Waiting on dependencies
  steps: Array<{
    step_number: number;
    status: string;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    error?: string;
    files_modified?: string[];
  }>;
  started_at?: string;
  completed_at?: string;
  total_duration_ms?: number;
}
```

---

## Execution Tools

### 13. `execute_plan_step`

**Description**: Execute a single step from a plan.

**Input Schema**:
```typescript
{
  plan_id: string;
  step_number: number;
  options?: {
    dry_run?: boolean;        // Preview without executing
    timeout_ms?: number;      // Override default timeout
  };
}
```

**Output**:
```typescript
{
  success: boolean;
  step_number: number;
  duration_ms: number;
  files_modified?: string[];
  error?: string;
  retries?: number;
}
```

---

## Reactive Review Tools

### 14. `start_reactive_review`

**Description**: Start asynchronous review session for large PRs.

**Input Schema**:
```typescript
{
  pr_metadata: {
    pr_number: number;
    title: string;
    description?: string;
    base_branch: string;
    head_branch: string;
    author?: string;
  };
  options?: {
    max_concurrent_steps?: number;  // Default: CPU cores - 1
    step_timeout_ms?: number;       // Default: 300000 (5 min)
    enable_static_analysis?: boolean;
    enable_llm_review?: boolean;
  };
}
```

**Output**:
```typescript
{
  success: boolean;
  session_id: string;         // Use for status checks
  status: 'pending' | 'planning' | 'ready' | 'executing';
  message: string;
}
```

---

### 15. `get_reactive_status`

**Description**: Get status of reactive review session.

**Input Schema**:
```typescript
{
  session_id: string;
}
```

**Output**:
```typescript
{
  session: {
    id: string;
    pr_number: number;
    status: string;
    created_at: string;
    updated_at: string;
    total_steps?: number;
  };
  progress: {
    completed_steps: number;
    total_steps: number;
    percentage: number;
  };
  telemetry: {
    start_time: string;
    elapsed_ms: number;
    tokens_used: number;
    cache_hit_rate: number;
    last_activity_ms?: number;
    appears_stalled?: boolean;
  };
  findings_count: number;
}
```

---

### 16-19. Session Control Tools

**`pause_reactive_review`**: Pause active session
**`resume_reactive_review`**: Resume paused session
**`cancel_reactive_review`**: Cancel session
**`get_reactive_findings`**: Get findings from completed session

All follow similar patterns with `session_id` input.

---

## Persistence Tools

### 20. `save_plan`

**Description**: Persist plan to disk.

**Input Schema**:
```typescript
{
  plan: EnhancedPlanOutput;   // Plan object from generate_plan
  name?: string;              // Optional name
}
```

---

### 21. `load_plan`

**Description**: Load saved plan.

**Input Schema**:
```typescript
{
  plan_id: string;
}
```

---

### 22. `list_plans`

**Description**: List all saved plans.

**Output**:
```typescript
{
  plans: Array<{
    id: string;
    name?: string;
    goal: string;
    created_at: string;
    version: number;
  }>;
}
```

---

### 23. `get_plan_history`

**Description**: Get version history for a plan.

**Input Schema**:
```typescript
{
  plan_id: string;
}
```

**Output**:
```typescript
{
  plan_id: string;
  versions: Array<{
    version: number;
    created_at: string;
    changes: string;
  }>;
}
```

---

## Error Handling

All tools return errors in this format:

```typescript
{
  error: {
    code: string;             // Error code (e.g., "INVALID_INPUT")
    message: string;          // Human-readable message
    details?: any;            // Additional context
  }
}
```

Common error codes:
- `INVALID_INPUT`: Invalid parameters
- `FILE_NOT_FOUND`: File doesn't exist
- `TIMEOUT`: Operation timed out
- `EXECUTION_FAILED`: Step execution failed
- `PLAN_NOT_FOUND`: Plan ID not found
- `SESSION_NOT_FOUND`: Session ID not found

---

## Rate Limits & Quotas

- **Semantic Search**: No hard limit, cached results
- **LLM Review**: Subject to LLM provider limits
- **Static Analysis**: Limited by system resources
- **Concurrent Sessions**: Limited by `max_concurrent_steps` config

---

**Version**: 1.8.0  
**Last Updated**: 2025-12-26

