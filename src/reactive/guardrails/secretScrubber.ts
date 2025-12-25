/**
 * Secret Scrubber
 *
 * Phase 4: Security guardrail that scrubs secrets from content
 * before it is sent to LLMs or persisted.
 *
 * This is a critical security component that prevents accidental
 * exposure of secrets like API keys, passwords, tokens, etc.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A detected secret in the content
 */
export interface DetectedSecret {
    /** Type of secret detected */
    type: SecretType;

    /** Original value (for logging/auditing) */
    originalValue: string;

    /** Masked/redacted value */
    maskedValue: string;

    /** Start position in the original content */
    startIndex: number;

    /** End position in the original content */
    endIndex: number;

    /** The regex pattern that matched */
    patternName: string;

    /** Confidence level */
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Types of secrets that can be detected
 */
export type SecretType =
    | 'api_key'
    | 'aws_key'
    | 'aws_secret'
    | 'private_key'
    | 'password'
    | 'connection_string'
    | 'jwt_token'
    | 'github_token'
    | 'slack_token'
    | 'stripe_key'
    | 'openai_key'
    | 'anthropic_key'
    | 'supabase_key'
    | 'firebase_key'
    | 'general_secret';

/**
 * Result of scrubbing operation
 */
export interface ScrubResult {
    /** Scrubbed content with secrets redacted */
    scrubbedContent: string;

    /** Detected secrets (with masked values) */
    detectedSecrets: DetectedSecret[];

    /** Whether any secrets were found */
    hasSecrets: boolean;

    /** Processing time in milliseconds */
    processingTime: number;
}

/**
 * Options for the secret scrubber
 */
export interface SecretScrubberOptions {
    /** Mask character to use (default: '*') */
    maskChar: string;

    /** Number of characters to show at start (default: 4) */
    showStart: number;

    /** Number of characters to show at end (default: 0) */
    showEnd: number;

    /** Minimum length for a secret to be scrubbed (default: 8) */
    minSecretLength: number;

    /** Include detection stats in result */
    includeStats: boolean;

    /** Custom patterns to add */
    customPatterns?: SecretPattern[];
}

/**
 * A pattern for detecting secrets
 */
export interface SecretPattern {
    /** Pattern name for identification */
    name: string;

    /** Type of secret */
    type: SecretType;

    /** Regex pattern */
    pattern: RegExp;

    /** Confidence level */
    confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: SecretScrubberOptions = {
    maskChar: '*',
    showStart: 4,
    showEnd: 0,
    minSecretLength: 8,
    includeStats: false,
};

/**
 * Built-in secret detection patterns
 * Ordered by specificity (most specific first)
 */
const BUILTIN_PATTERNS: SecretPattern[] = [
    // AWS
    {
        name: 'aws_access_key',
        type: 'aws_key',
        pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
        confidence: 'high',
    },
    {
        name: 'aws_secret_key',
        type: 'aws_secret',
        pattern: /(?:aws_secret_access_key|aws_secret|secret_key)\s*[=:]\s*['"]?([A-Za-z0-9+/=]{40})['"]?/gi,
        confidence: 'high',
    },

    // OpenAI
    {
        name: 'openai_api_key',
        type: 'openai_key',
        pattern: /sk-[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}/g,
        confidence: 'high',
    },
    {
        name: 'openai_api_key_v2',
        type: 'openai_key',
        pattern: /sk-proj-[a-zA-Z0-9_-]{80,}/g,
        confidence: 'high',
    },

    // Anthropic
    {
        name: 'anthropic_api_key',
        type: 'anthropic_key',
        pattern: /sk-ant-[a-zA-Z0-9_-]{40,}/g,
        confidence: 'high',
    },

    // GitHub
    {
        name: 'github_token',
        type: 'github_token',
        pattern: /ghp_[a-zA-Z0-9]{36,}/g,
        confidence: 'high',
    },
    {
        name: 'github_oauth',
        type: 'github_token',
        pattern: /gho_[a-zA-Z0-9]{36,}/g,
        confidence: 'high',
    },
    {
        name: 'github_pat',
        type: 'github_token',
        pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
        confidence: 'high',
    },

    // Stripe
    {
        name: 'stripe_secret_key',
        type: 'stripe_key',
        pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
        confidence: 'high',
    },
    {
        name: 'stripe_test_key',
        type: 'stripe_key',
        pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
        confidence: 'high',
    },

    // Supabase
    {
        name: 'supabase_key',
        type: 'supabase_key',
        pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        confidence: 'medium', // JWTs are common, but this catches Supabase's
    },

    // Firebase
    {
        name: 'firebase_api_key',
        type: 'firebase_key',
        pattern: /AIza[A-Za-z0-9_-]{35}/g,
        confidence: 'high',
    },

    // Slack
    {
        name: 'slack_token',
        type: 'slack_token',
        pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}(-[a-zA-Z0-9]{24,})?/g,
        confidence: 'high',
    },

    // Private Keys
    {
        name: 'private_key_pem',
        type: 'private_key',
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
        confidence: 'high',
    },

    // JWT
    {
        name: 'jwt_token',
        type: 'jwt_token',
        pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        confidence: 'medium',
    },

    // Connection Strings
    {
        name: 'postgres_connection',
        type: 'connection_string',
        pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+\/[^\s'"]+/gi,
        confidence: 'high',
    },
    {
        name: 'mysql_connection',
        type: 'connection_string',
        pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+\/[^\s'"]+/gi,
        confidence: 'high',
    },
    {
        name: 'mongodb_connection',
        type: 'connection_string',
        pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
        confidence: 'high',
    },

    // Generic API Keys (lower confidence)
    {
        name: 'generic_api_key',
        type: 'api_key',
        pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
        confidence: 'medium',
    },
    {
        name: 'generic_secret',
        type: 'general_secret',
        pattern: /(?:secret|token|password|passwd|pwd)\s*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,
        confidence: 'low',
    },
];

// ============================================================================
// SecretScrubber
// ============================================================================

export class SecretScrubber {
    private options: SecretScrubberOptions;
    private patterns: SecretPattern[];

    /** Statistics */
    private stats = {
        totalScrubs: 0,
        secretsFound: 0,
        byType: new Map<SecretType, number>(),
    };

    constructor(options?: Partial<SecretScrubberOptions>) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.patterns = [...BUILTIN_PATTERNS];

        if (options?.customPatterns) {
            this.patterns.push(...options.customPatterns);
        }
    }

    // ============================================================================
    // Core Methods
    // ============================================================================

    /**
     * Scrub secrets from content.
     * 
     * @param content The content to scrub
     * @returns Scrub result with cleaned content and detected secrets
     */
    scrub(content: string): ScrubResult {
        const startTime = Date.now();
        const detectedSecrets: DetectedSecret[] = [];

        // First pass: detect all secrets
        for (const pattern of this.patterns) {
            // Reset regex lastIndex for global patterns
            pattern.pattern.lastIndex = 0;

            let match: RegExpExecArray | null;
            while ((match = pattern.pattern.exec(content)) !== null) {
                const secretValue = match[1] || match[0]; // Use capture group if available

                // Skip if too short
                if (secretValue.length < this.options.minSecretLength) {
                    continue;
                }

                // Check for overlapping detections
                const matchIndex = match.index;
                const matchLength = match[0].length;
                const isOverlapping = detectedSecrets.some(
                    (existing) =>
                        matchIndex < existing.endIndex && matchIndex + matchLength > existing.startIndex
                );

                if (!isOverlapping) {
                    detectedSecrets.push({
                        type: pattern.type,
                        originalValue: secretValue,
                        maskedValue: this.maskSecret(secretValue),
                        startIndex: matchIndex,
                        endIndex: matchIndex + matchLength,
                        patternName: pattern.name,
                        confidence: pattern.confidence,
                    });
                }
            }
        }

        // Sort by position (reverse order for replacement)
        detectedSecrets.sort((a, b) => b.startIndex - a.startIndex);

        // Second pass: replace secrets
        let scrubbedContent = content;
        for (const secret of detectedSecrets) {
            const before = scrubbedContent.substring(0, secret.startIndex);
            const after = scrubbedContent.substring(secret.endIndex);
            const replacement = scrubbedContent
                .substring(secret.startIndex, secret.endIndex)
                .replace(secret.originalValue, secret.maskedValue);

            scrubbedContent = before + replacement + after;
        }

        // Update stats
        this.stats.totalScrubs++;
        this.stats.secretsFound += detectedSecrets.length;
        for (const secret of detectedSecrets) {
            const count = this.stats.byType.get(secret.type) || 0;
            this.stats.byType.set(secret.type, count + 1);
        }

        // Re-sort for output (original order)
        detectedSecrets.sort((a, b) => a.startIndex - b.startIndex);

        return {
            scrubbedContent,
            detectedSecrets,
            hasSecrets: detectedSecrets.length > 0,
            processingTime: Date.now() - startTime,
        };
    }

    /**
     * Quick check if content contains any secrets.
     * More efficient than full scrub when you just need to know.
     * 
     * @param content The content to check
     * @returns true if secrets were detected
     */
    hasSecrets(content: string): boolean {
        for (const pattern of this.patterns) {
            pattern.pattern.lastIndex = 0;
            if (pattern.pattern.test(content)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Mask a secret value.
     * 
     * @param secret The secret to mask
     * @returns Masked secret
     */
    maskSecret(secret: string): string {
        const { maskChar, showStart, showEnd } = this.options;

        if (secret.length <= showStart + showEnd) {
            return maskChar.repeat(secret.length);
        }

        const start = secret.substring(0, showStart);
        const end = showEnd > 0 ? secret.substring(secret.length - showEnd) : '';
        const masked = maskChar.repeat(Math.min(secret.length - showStart - showEnd, 20));

        return `${start}${masked}${end}`;
    }

    // ============================================================================
    // Pattern Management
    // ============================================================================

    /**
     * Add a custom secret pattern.
     */
    addPattern(pattern: SecretPattern): void {
        this.patterns.push(pattern);
    }

    /**
     * Remove a pattern by name.
     */
    removePattern(name: string): boolean {
        const index = this.patterns.findIndex((p) => p.name === name);
        if (index >= 0) {
            this.patterns.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get all registered patterns.
     */
    getPatterns(): SecretPattern[] {
        return [...this.patterns];
    }

    // ============================================================================
    // Statistics
    // ============================================================================

    /**
     * Get scrubbing statistics.
     */
    getStats(): {
        totalScrubs: number;
        secretsFound: number;
        byType: Record<string, number>;
    } {
        return {
            totalScrubs: this.stats.totalScrubs,
            secretsFound: this.stats.secretsFound,
            byType: Object.fromEntries(this.stats.byType),
        };
    }

    /**
     * Reset statistics.
     */
    resetStats(): void {
        this.stats = {
            totalScrubs: 0,
            secretsFound: 0,
            byType: new Map(),
        };
    }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a default secret scrubber instance.
 */
export function createSecretScrubber(
    options?: Partial<SecretScrubberOptions>
): SecretScrubber {
    return new SecretScrubber(options);
}

/**
 * Quick scrub function for one-off usage.
 */
export function scrubSecrets(content: string): ScrubResult {
    const scrubber = new SecretScrubber();
    return scrubber.scrub(content);
}
