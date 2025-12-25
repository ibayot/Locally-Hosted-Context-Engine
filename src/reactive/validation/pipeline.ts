/**
 * Validation Pipeline
 *
 * Phase 4: Multi-tier validation for reactive code review outputs.
 * 
 * The validation pipeline uses a tiered approach:
 * - Tier 1 (Deterministic): Fast, rule-based checks (syntax, schema)
 * - Tier 2 (Heuristic): Pattern-based checks (best practices, style)
 * - Tier 3 (LLM-based): AI-powered validation (future)
 *
 * All review outputs pass through this pipeline before being
 * presented to the user or persisted.
 */

import { SecretScrubber, ScrubResult } from '../guardrails/secretScrubber.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Validation tier levels
 */
export type ValidationTier = 'tier1_deterministic' | 'tier2_heuristic' | 'tier3_llm';

/**
 * Severity of validation findings
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation finding
 */
export interface ValidationFinding {
    /** Unique finding ID */
    id: string;

    /** Validation tier that produced this finding */
    tier: ValidationTier;

    /** Severity level */
    severity: ValidationSeverity;

    /** Finding category */
    category: string;

    /** Rule ID that triggered this finding */
    ruleId: string;

    /** Human-readable message */
    message: string;

    /** File path (if applicable) */
    filePath?: string;

    /** Line number (if applicable) */
    lineNumber?: number;

    /** Suggested fix */
    suggestion?: string;

    /** Additional context */
    context?: Record<string, unknown>;
}

/**
 * Result of running the validation pipeline
 */
export interface ValidationResult {
    /** Whether validation passed (no errors) */
    passed: boolean;

    /** All findings from all tiers */
    findings: ValidationFinding[];

    /** Findings grouped by severity */
    bySeverity: {
        errors: ValidationFinding[];
        warnings: ValidationFinding[];
        info: ValidationFinding[];
    };

    /** Secret scrubbing result */
    secretScrub?: ScrubResult;

    /** Processing time in milliseconds */
    processingTime: number;

    /** Which tiers were run */
    tiersRun: ValidationTier[];
}

/**
 * Input content for validation
 */
export interface ValidationInput {
    /** The content to validate */
    content: string;

    /** Content type */
    contentType: 'review_finding' | 'plan_output' | 'generated_code' | 'raw_text';

    /** Optional file context */
    filePath?: string;

    /** Optional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Options for the validation pipeline
 */
export interface ValidationPipelineOptions {
    /** Enable secret scrubbing (default: true) */
    scrubSecrets: boolean;

    /** Stop on first error (default: false) */
    stopOnError: boolean;

    /** Maximum findings to return (default: 100) */
    maxFindings: number;

    /** Tiers to enable (default: all) */
    enabledTiers: ValidationTier[];

    /** Custom rules to add */
    customRules?: ValidationRule[];
}

/**
 * A validation rule
 */
export interface ValidationRule {
    /** Rule ID */
    id: string;

    /** Rule name */
    name: string;

    /** Tier this rule belongs to */
    tier: ValidationTier;

    /** Category */
    category: string;

    /** Severity if triggered */
    severity: ValidationSeverity;

    /** Validation function */
    validate: (input: ValidationInput) => ValidationFinding[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: ValidationPipelineOptions = {
    scrubSecrets: true,
    stopOnError: false,
    maxFindings: 100,
    enabledTiers: ['tier1_deterministic', 'tier2_heuristic'],
};

// ============================================================================
// Built-in Rules
// ============================================================================

const TIER1_RULES: ValidationRule[] = [
    // Check for unbalanced brackets/braces
    {
        id: 'T1-001',
        name: 'balanced_brackets',
        tier: 'tier1_deterministic',
        category: 'syntax',
        severity: 'error',
        validate: (input: ValidationInput): ValidationFinding[] => {
            const findings: ValidationFinding[] = [];
            const stack: { char: string; index: number }[] = [];
            const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
            const openers = new Set(['(', '[', '{']);
            const closers = new Set([')', ']', '}']);

            for (let i = 0; i < input.content.length; i++) {
                const char = input.content[i];
                if (openers.has(char)) {
                    stack.push({ char, index: i });
                } else if (closers.has(char)) {
                    const last = stack.pop();
                    if (!last || pairs[last.char] !== char) {
                        findings.push({
                            id: `finding-${Date.now()}-${i}`,
                            tier: 'tier1_deterministic',
                            severity: 'error',
                            category: 'syntax',
                            ruleId: 'T1-001',
                            message: `Unbalanced bracket: '${char}' at position ${i}`,
                            lineNumber: input.content.substring(0, i).split('\n').length,
                        });
                    }
                }
            }

            // Check for unclosed brackets
            for (const unclosed of stack) {
                findings.push({
                    id: `finding-${Date.now()}-${unclosed.index}`,
                    tier: 'tier1_deterministic',
                    severity: 'error',
                    category: 'syntax',
                    ruleId: 'T1-001',
                    message: `Unclosed bracket: '${unclosed.char}' at position ${unclosed.index}`,
                    lineNumber: input.content.substring(0, unclosed.index).split('\n').length,
                });
            }

            return findings;
        },
    },

    // Check JSON validity
    {
        id: 'T1-002',
        name: 'valid_json',
        tier: 'tier1_deterministic',
        category: 'schema',
        severity: 'error',
        validate: (input: ValidationInput): ValidationFinding[] => {
            // Only validate JSON content
            if (input.contentType !== 'plan_output') return [];

            try {
                JSON.parse(input.content);
                return [];
            } catch (e) {
                return [
                    {
                        id: `finding-${Date.now()}`,
                        tier: 'tier1_deterministic',
                        severity: 'error',
                        category: 'schema',
                        ruleId: 'T1-002',
                        message: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
                    },
                ];
            }
        },
    },

    // Check for empty content
    {
        id: 'T1-003',
        name: 'non_empty_content',
        tier: 'tier1_deterministic',
        category: 'content',
        severity: 'warning',
        validate: (input: ValidationInput): ValidationFinding[] => {
            if (input.content.trim().length === 0) {
                return [
                    {
                        id: `finding-${Date.now()}`,
                        tier: 'tier1_deterministic',
                        severity: 'warning',
                        category: 'content',
                        ruleId: 'T1-003',
                        message: 'Content is empty or contains only whitespace',
                    },
                ];
            }
            return [];
        },
    },
];

const TIER2_RULES: ValidationRule[] = [
    // Check for TODO/FIXME in generated code
    {
        id: 'T2-001',
        name: 'no_todo_fixme',
        tier: 'tier2_heuristic',
        category: 'completeness',
        severity: 'warning',
        validate: (input: ValidationInput): ValidationFinding[] => {
            if (input.contentType !== 'generated_code') return [];

            const findings: ValidationFinding[] = [];
            const todoPattern = /\b(TODO|FIXME|XXX|HACK)\b.*$/gim;

            let match;
            while ((match = todoPattern.exec(input.content)) !== null) {
                const lineNumber = input.content.substring(0, match.index).split('\n').length;
                findings.push({
                    id: `finding-${Date.now()}-${match.index}`,
                    tier: 'tier2_heuristic',
                    severity: 'warning',
                    category: 'completeness',
                    ruleId: 'T2-001',
                    message: `Found ${match[1]}: ${match[0].substring(0, 60)}...`,
                    lineNumber,
                    filePath: input.filePath,
                });
            }

            return findings;
        },
    },

    // Check for console.log in production code
    {
        id: 'T2-002',
        name: 'no_console_log',
        tier: 'tier2_heuristic',
        category: 'best_practices',
        severity: 'info',
        validate: (input: ValidationInput): ValidationFinding[] => {
            if (input.contentType !== 'generated_code') return [];

            const findings: ValidationFinding[] = [];
            const consolePattern = /\bconsole\.(log|debug|info|warn|error)\s*\(/g;

            let match;
            while ((match = consolePattern.exec(input.content)) !== null) {
                const lineNumber = input.content.substring(0, match.index).split('\n').length;
                findings.push({
                    id: `finding-${Date.now()}-${match.index}`,
                    tier: 'tier2_heuristic',
                    severity: 'info',
                    category: 'best_practices',
                    ruleId: 'T2-002',
                    message: `Console statement found: ${match[0]}`,
                    lineNumber,
                    filePath: input.filePath,
                    suggestion: 'Consider using a proper logging library in production',
                });
            }

            return findings;
        },
    },

    // Check for hardcoded URLs
    {
        id: 'T2-003',
        name: 'no_hardcoded_urls',
        tier: 'tier2_heuristic',
        category: 'maintainability',
        severity: 'info',
        validate: (input: ValidationInput): ValidationFinding[] => {
            if (input.contentType !== 'generated_code') return [];

            const findings: ValidationFinding[] = [];
            const urlPattern = /https?:\/\/(?:localhost|127\.0\.0\.1|[a-z0-9-]+\.[a-z]{2,})[^\s"'`]*/gi;

            let match;
            while ((match = urlPattern.exec(input.content)) !== null) {
                // Skip common safe URLs
                if (match[0].includes('example.com') || match[0].includes('schema.org')) {
                    continue;
                }

                const lineNumber = input.content.substring(0, match.index).split('\n').length;
                findings.push({
                    id: `finding-${Date.now()}-${match.index}`,
                    tier: 'tier2_heuristic',
                    severity: 'info',
                    category: 'maintainability',
                    ruleId: 'T2-003',
                    message: `Hardcoded URL found: ${match[0].substring(0, 40)}...`,
                    lineNumber,
                    filePath: input.filePath,
                    suggestion: 'Consider using environment variables for URLs',
                });
            }

            return findings;
        },
    },

    // Check for excessive line length
    {
        id: 'T2-004',
        name: 'line_length',
        tier: 'tier2_heuristic',
        category: 'style',
        severity: 'info',
        validate: (input: ValidationInput): ValidationFinding[] => {
            const findings: ValidationFinding[] = [];
            const maxLength = 120;
            const lines = input.content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > maxLength) {
                    findings.push({
                        id: `finding-${Date.now()}-${i}`,
                        tier: 'tier2_heuristic',
                        severity: 'info',
                        category: 'style',
                        ruleId: 'T2-004',
                        message: `Line ${i + 1} exceeds ${maxLength} characters (${lines[i].length})`,
                        lineNumber: i + 1,
                        filePath: input.filePath,
                    });
                }
            }

            // Limit findings to avoid noise
            return findings.slice(0, 5);
        },
    },
];

// ============================================================================
// ValidationPipeline
// ============================================================================

export class ValidationPipeline {
    private options: ValidationPipelineOptions;
    private secretScrubber: SecretScrubber;
    private rules: ValidationRule[];

    /** Statistics */
    private stats = {
        totalValidations: 0,
        passedValidations: 0,
        totalFindings: 0,
        bySeverity: {
            error: 0,
            warning: 0,
            info: 0,
        },
    };

    constructor(options?: Partial<ValidationPipelineOptions>) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.secretScrubber = new SecretScrubber();
        this.rules = [...TIER1_RULES, ...TIER2_RULES];

        if (options?.customRules) {
            this.rules.push(...options.customRules);
        }
    }

    // ============================================================================
    // Core Methods
    // ============================================================================

    /**
     * Run the validation pipeline on content.
     * 
     * @param input Validation input
     * @returns Validation result
     */
    validate(input: ValidationInput): ValidationResult {
        const startTime = Date.now();
        const findings: ValidationFinding[] = [];
        const tiersRun: ValidationTier[] = [];
        let secretScrub: ScrubResult | undefined;

        // Secret scrubbing (always tier 0)
        if (this.options.scrubSecrets) {
            secretScrub = this.secretScrubber.scrub(input.content);

            // Add findings for detected secrets
            for (const secret of secretScrub.detectedSecrets) {
                findings.push({
                    id: `secret-${Date.now()}-${secret.startIndex}`,
                    tier: 'tier1_deterministic',
                    severity: 'error',
                    category: 'security',
                    ruleId: 'SECRET-001',
                    message: `Secret detected: ${secret.type} (${secret.patternName})`,
                    context: {
                        maskedValue: secret.maskedValue,
                        confidence: secret.confidence,
                    },
                });
            }
        }

        // Run enabled tiers
        for (const tier of this.options.enabledTiers) {
            if (this.options.stopOnError && findings.some((f) => f.severity === 'error')) {
                break;
            }

            tiersRun.push(tier);

            // Get rules for this tier
            const tierRules = this.rules.filter((r) => r.tier === tier);

            for (const rule of tierRules) {
                try {
                    const ruleFindings = rule.validate(input);
                    findings.push(...ruleFindings);

                    if (findings.length >= this.options.maxFindings) {
                        break;
                    }
                } catch (error) {
                    // Rule execution error - add as warning
                    findings.push({
                        id: `rule-error-${rule.id}`,
                        tier,
                        severity: 'warning',
                        category: 'internal',
                        ruleId: rule.id,
                        message: `Rule execution error: ${error instanceof Error ? error.message : 'unknown'}`,
                    });
                }
            }
        }

        // Truncate findings if needed
        const truncatedFindings = findings.slice(0, this.options.maxFindings);

        // Group by severity
        const bySeverity = {
            errors: truncatedFindings.filter((f) => f.severity === 'error'),
            warnings: truncatedFindings.filter((f) => f.severity === 'warning'),
            info: truncatedFindings.filter((f) => f.severity === 'info'),
        };

        // Determine pass/fail
        const passed = bySeverity.errors.length === 0;

        // Update stats
        this.stats.totalValidations++;
        if (passed) this.stats.passedValidations++;
        this.stats.totalFindings += truncatedFindings.length;
        this.stats.bySeverity.error += bySeverity.errors.length;
        this.stats.bySeverity.warning += bySeverity.warnings.length;
        this.stats.bySeverity.info += bySeverity.info.length;

        return {
            passed,
            findings: truncatedFindings,
            bySeverity,
            secretScrub,
            processingTime: Date.now() - startTime,
            tiersRun,
        };
    }

    /**
     * Quick check if content is valid (no errors).
     * 
     * @param input Validation input
     * @returns true if validation passed
     */
    isValid(input: ValidationInput): boolean {
        const result = this.validate(input);
        return result.passed;
    }

    // ============================================================================
    // Rule Management
    // ============================================================================

    /**
     * Add a custom validation rule.
     */
    addRule(rule: ValidationRule): void {
        this.rules.push(rule);
    }

    /**
     * Remove a rule by ID.
     */
    removeRule(ruleId: string): boolean {
        const index = this.rules.findIndex((r) => r.id === ruleId);
        if (index >= 0) {
            this.rules.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get all registered rules.
     */
    getRules(): ValidationRule[] {
        return [...this.rules];
    }

    /**
     * Enable/disable a tier.
     */
    setTierEnabled(tier: ValidationTier, enabled: boolean): void {
        if (enabled && !this.options.enabledTiers.includes(tier)) {
            this.options.enabledTiers.push(tier);
        } else if (!enabled) {
            this.options.enabledTiers = this.options.enabledTiers.filter((t) => t !== tier);
        }
    }

    // ============================================================================
    // Statistics
    // ============================================================================

    /**
     * Get validation statistics.
     */
    getStats(): {
        totalValidations: number;
        passedValidations: number;
        passRate: number;
        totalFindings: number;
        bySeverity: Record<string, number>;
    } {
        const passRate =
            this.stats.totalValidations > 0
                ? this.stats.passedValidations / this.stats.totalValidations
                : 1;

        return {
            totalValidations: this.stats.totalValidations,
            passedValidations: this.stats.passedValidations,
            passRate,
            totalFindings: this.stats.totalFindings,
            bySeverity: { ...this.stats.bySeverity },
        };
    }

    /**
     * Reset statistics.
     */
    resetStats(): void {
        this.stats = {
            totalValidations: 0,
            passedValidations: 0,
            totalFindings: 0,
            bySeverity: { error: 0, warning: 0, info: 0 },
        };
    }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a default validation pipeline instance.
 */
export function createValidationPipeline(
    options?: Partial<ValidationPipelineOptions>
): ValidationPipeline {
    return new ValidationPipeline(options);
}

/**
 * Quick validate function for one-off usage.
 */
export function validateContent(input: ValidationInput): ValidationResult {
    const pipeline = new ValidationPipeline();
    return pipeline.validate(input);
}
