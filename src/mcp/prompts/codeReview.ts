/**
 * Code Review Prompts
 *
 * System prompts and prompt builders for AI-powered code review.
 * Synthesized from best practices of CodeRabbit, OpenAI Codex,
 * Microsoft PRAssistant, and Google AutoCommenter.
 *
 * Key features:
 * - Structured JSON output schema
 * - Confidence scoring per finding
 * - Changed lines filter awareness
 * - Priority classification (P0-P3)
 */

import type { ReviewCategory, ReviewOptions } from '../types/codeReview.js';

// ============================================================================
// Main Code Review System Prompt
// ============================================================================

/**
 * System prompt for code review
 *
 * This prompt synthesizes best practices from:
 * - OpenAI Codex: Structured output schema, confidence scoring
 * - CodeRabbit: Priority levels, actionable suggestions
 * - Google AutoCommenter: Changed lines focus, category taxonomy
 * - Microsoft PRAssistant: Security focus, pattern detection
 */
export const CODE_REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer performing a thorough analysis of code changes.

## Your Role
- Analyze the provided diff and code context
- Identify issues in correctness, security, performance, maintainability, style, and documentation
- Provide actionable, specific feedback with confidence scores
- Focus primarily on changed lines (lines with + prefix in diff)

## Strict Rules
- Output ONLY valid JSON matching the exact schema below
- No extra text, markdown, or explanations outside the JSON
- Every finding MUST have a confidence_score between 0 and 1
- Findings on unchanged lines should have is_on_changed_line: false
- Prioritize findings: P0 (critical) > P1 (high) > P2 (medium) > P3 (low)

## Priority Definitions
- P0 (priority: 0): Critical bugs, security vulnerabilities, data loss risks - MUST fix before merge
- P1 (priority: 1): Likely bugs, significant performance issues, missing validation - SHOULD fix before merge
- P2 (priority: 2): Code smells, minor inefficiencies, missing edge cases - CONSIDER fixing
- P3 (priority: 3): Style issues, minor improvements, suggestions - NICE to have

## Category Definitions
- correctness: Bugs, logic errors, edge cases, null/undefined handling, type errors
- security: Vulnerabilities, injection risks, authentication/authorization issues, secrets exposure
- performance: Inefficiencies, memory leaks, N+1 queries, unnecessary re-renders
- maintainability: Code clarity, modularity, test coverage, complexity, coupling
- style: Formatting, naming conventions, consistency with codebase
- documentation: Missing/incorrect comments, docstrings, API documentation

## Confidence Score Guidelines
- 0.9-1.0: Certain - clear violation of best practice or definite bug
- 0.7-0.9: High confidence - very likely an issue
- 0.5-0.7: Moderate - possible issue, worth reviewing
- 0.3-0.5: Low - might be intentional, consider context
- Below 0.3: Very uncertain - filter out unless critical

## Output Schema
Return a JSON object with this EXACT structure:

{
  "findings": [
    {
      "id": "finding_1",
      "title": "Short title (max 80 chars)",
      "body": "Detailed explanation of the issue and why it matters",
      "confidence_score": 0.85,
      "priority": 1,
      "category": "correctness",
      "code_location": {
        "file_path": "src/path/to/file.ts",
        "line_range": {"start": 10, "end": 15}
      },
      "suggestion": {
        "description": "How to fix this issue",
        "code_snippet": "// Optional: example fix code",
        "can_auto_fix": false
      },
      "is_on_changed_line": true
    }
  ],
  "overall_correctness": "patch is correct|patch is incorrect|needs attention",
  "overall_explanation": "High-level summary of the review findings",
  "overall_confidence_score": 0.8
}

## Best Practices
1. Be specific - reference exact line numbers and code snippets
2. Explain WHY something is an issue, not just WHAT
3. Provide actionable suggestions when possible
4. Consider the context - don't flag intentional patterns
5. Prioritize security and correctness over style
6. Keep titles concise but descriptive
7. Group related issues when appropriate`;

// ============================================================================
// Category-Specific Review Prompts
// ============================================================================

/**
 * Additional prompt sections for specific category focus
 */
export const CATEGORY_FOCUS_PROMPTS: Record<ReviewCategory, string> = {
  correctness: `
## Additional Focus: Correctness
Pay special attention to:
- Null/undefined handling
- Off-by-one errors
- Race conditions
- Edge cases (empty arrays, null inputs, boundary values)
- Type mismatches
- Incorrect boolean logic`,

  security: `
## Additional Focus: Security
Pay special attention to:
- SQL/NoSQL injection vulnerabilities
- XSS (Cross-Site Scripting) risks
- CSRF vulnerabilities
- Authentication/authorization bypasses
- Sensitive data exposure (secrets, PII)
- Insecure cryptographic practices
- Path traversal vulnerabilities`,

  performance: `
## Additional Focus: Performance
Pay special attention to:
- N+1 query patterns
- Unnecessary re-renders (React)
- Memory leaks (event listeners, subscriptions)
- Inefficient algorithms (O(n²) when O(n) possible)
- Unnecessary data copying
- Missing caching opportunities
- Blocking operations on main thread`,

  maintainability: `
## Additional Focus: Maintainability
Pay special attention to:
- High cyclomatic complexity
- Long functions (>50 lines)
- Deep nesting (>3 levels)
- Code duplication
- Missing or inadequate tests
- Tight coupling between modules
- Unclear naming or logic`,

  style: `
## Additional Focus: Style
Pay special attention to:
- Inconsistent naming conventions
- Formatting issues
- Import organization
- Dead code
- Commented-out code
- Magic numbers without explanation`,

  documentation: `
## Additional Focus: Documentation
Pay special attention to:
- Missing JSDoc/docstrings for public APIs
- Outdated comments
- Missing README updates for new features
- Unclear or misleading comments
- Missing type annotations`,
};

// ============================================================================
// Prompt Builder Functions
// ============================================================================

/**
 * Build the main code review prompt with diff and context
 */
export function buildCodeReviewPrompt(
  diff: string,
  fileContexts: Record<string, string> = {},
  options: ReviewOptions = {}
): string {
  const {
    categories,
    changed_lines_only = true,
    custom_instructions,
    confidence_threshold = 0.7,
  } = options;

  let prompt = `## Diff to Review
\`\`\`diff
${diff}
\`\`\`
`;

  // Add file contexts if provided
  if (Object.keys(fileContexts).length > 0) {
    prompt += `\n## File Contexts (for additional understanding)\n`;
    for (const [path, content] of Object.entries(fileContexts)) {
      prompt += `\n### ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
    }
  }

  // Add category focus if specific categories requested
  if (categories && categories.length > 0) {
    prompt += `\n## Category Focus\nFocus your review on these categories: ${categories.join(', ')}\n`;
    for (const category of categories) {
      if (CATEGORY_FOCUS_PROMPTS[category]) {
        prompt += CATEGORY_FOCUS_PROMPTS[category];
      }
    }
  }

  // Add changed lines filter instruction
  if (changed_lines_only) {
    prompt += `\n## Changed Lines Filter
IMPORTANT: Strongly prefer reporting issues on CHANGED lines (lines with + prefix in the diff).
Only report issues on unchanged lines if they are P0 (critical) issues directly affected by the changes.
Set is_on_changed_line appropriately for each finding.`;
  }

  // Add confidence threshold instruction
  prompt += `\n\n## Confidence Threshold
Only include findings with confidence_score >= ${confidence_threshold}.
Filter out uncertain or speculative findings.`;

  // Add custom instructions if provided
  if (custom_instructions) {
    prompt += `\n\n## Custom Instructions\n${custom_instructions}`;
  }

  prompt += `\n\n## Instructions
Analyze the diff above and return your findings as valid JSON matching the schema in your system prompt.
Order findings by priority (P0 first, then P1, etc.) and include confidence scores.`;

  return prompt;
}

/**
 * Build a prompt for reviewing a specific file
 */
export function buildFileReviewPrompt(
  filePath: string,
  fileContent: string,
  changedLines: number[],
  options: ReviewOptions = {}
): string {
  const { categories, custom_instructions } = options;

  let prompt = `## File to Review: ${filePath}

\`\`\`
${fileContent}
\`\`\`

## Changed Lines
The following line numbers were changed: ${changedLines.join(', ')}
Focus your review on these lines and their immediate context.`;

  if (categories && categories.length > 0) {
    prompt += `\n\n## Category Focus: ${categories.join(', ')}`;
  }

  if (custom_instructions) {
    prompt += `\n\n## Custom Instructions\n${custom_instructions}`;
  }

  return prompt;
}

/**
 * Extract JSON from a potentially messy LLM response
 */
export function extractJsonFromResponse(response: string): string | null {
  // Try to find JSON block in markdown code fence
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0].trim();
  }

  return null;
}

/**
 * Validate a parsed review result has required fields
 */
export function validateReviewResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;

  const obj = result as Record<string, unknown>;

  // Check required top-level fields
  if (!Array.isArray(obj.findings)) return false;
  if (typeof obj.overall_correctness !== 'string') return false;
  if (typeof obj.overall_explanation !== 'string') return false;
  if (typeof obj.overall_confidence_score !== 'number') return false;

  // Validate each finding has required fields
  for (const finding of obj.findings) {
    if (!finding || typeof finding !== 'object') return false;
    const f = finding as Record<string, unknown>;
    if (typeof f.id !== 'string') return false;
    if (typeof f.title !== 'string') return false;
    if (typeof f.body !== 'string') return false;
    if (typeof f.confidence_score !== 'number') return false;
    if (typeof f.priority !== 'number') return false;
    if (typeof f.category !== 'string') return false;
    if (!f.code_location || typeof f.code_location !== 'object') return false;
  }

  return true;
}

