/**
 * Deduplication Service
 *
 * Phase 3: Hash-based comment deduplication for reactive code reviews.
 * Prevents duplicate findings from being reported across reviews.
 *
 * Uses SHA-256 hashing to create a unique fingerprint for each finding
 * based on file path, line range, category, and message content.
 */

import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * A code review finding that can be deduplicated
 */
export interface DeduplicatableFinding {
    /** File path where the finding was detected */
    file_path: string;

    /** Starting line number (1-indexed) */
    start_line: number;

    /** Ending line number (1-indexed) */
    end_line: number;

    /** Category of finding (e.g., 'security', 'performance') */
    category: string;

    /** Subcategory or rule ID (optional) */
    rule_id?: string;

    /** The finding message */
    message: string;

    /** Severity level */
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

/**
 * Stored finding record with metadata
 */
interface StoredFinding {
    hash: string;
    plan_id: string;
    session_id?: string;
    first_seen: string;
    last_seen: string;
    occurrence_count: number;
}

/**
 * Deduplication options
 */
export interface DeduplicationOptions {
    /** Include line numbers in hash (default: true) */
    include_line_numbers: boolean;

    /** Include message in hash (default: true) */
    include_message: boolean;

    /** Maximum age in ms before a finding is considered "stale" (default: 7 days) */
    stale_after_ms: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: DeduplicationOptions = {
    include_line_numbers: true,
    include_message: true,
    stale_after_ms: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// DeduplicationService
// ============================================================================

export class DeduplicationService {
    /** In-memory store of finding hashes */
    private findingStore: Map<string, StoredFinding> = new Map();

    /** Deduplication options */
    private options: DeduplicationOptions;

    /** Stats counters */
    private stats = {
        total_checked: 0,
        duplicates_found: 0,
        unique_findings: 0,
    };

    constructor(options?: Partial<DeduplicationOptions>) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    // ============================================================================
    // Core Methods
    // ============================================================================

    /**
     * Generate a hash for a finding based on its key attributes.
     * The hash uniquely identifies a finding across reviews.
     * 
     * @param finding The finding to hash
     * @returns SHA-256 hash string
     */
    hashFinding(finding: DeduplicatableFinding): string {
        const components: string[] = [
            finding.file_path,
            finding.category,
            finding.severity,
        ];

        // Optionally include rule ID
        if (finding.rule_id) {
            components.push(finding.rule_id);
        }

        // Optionally include line numbers
        if (this.options.include_line_numbers) {
            components.push(String(finding.start_line));
            components.push(String(finding.end_line));
        }

        // Optionally include message (normalized)
        if (this.options.include_message) {
            // Normalize message: lowercase, remove extra whitespace
            const normalizedMessage = finding.message
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            components.push(normalizedMessage);
        }

        // Create hash
        const hashInput = components.join('|');
        return crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    /**
     * Check if a finding is a duplicate of a previously seen finding.
     * 
     * @param finding The finding to check
     * @returns true if this is a duplicate
     */
    isDuplicate(finding: DeduplicatableFinding): boolean {
        this.stats.total_checked++;

        const hash = this.hashFinding(finding);
        const stored = this.findingStore.get(hash);

        if (stored) {
            // Check if the stored finding is stale
            const lastSeenTime = new Date(stored.last_seen).getTime();
            const isStale = Date.now() - lastSeenTime > this.options.stale_after_ms;

            if (isStale) {
                // Stale findings are not considered duplicates
                return false;
            }

            this.stats.duplicates_found++;
            return true;
        }

        return false;
    }

    /**
     * Record a finding in the deduplication store.
     * Should be called after a finding is successfully reported.
     * 
     * @param finding The finding to record
     * @param planId Plan ID associated with the finding
     * @param sessionId Optional session ID
     */
    recordFinding(
        finding: DeduplicatableFinding,
        planId: string,
        sessionId?: string
    ): void {
        const hash = this.hashFinding(finding);
        const now = new Date().toISOString();

        const existing = this.findingStore.get(hash);

        if (existing) {
            // Update existing record
            existing.last_seen = now;
            existing.occurrence_count++;
        } else {
            // Create new record
            this.findingStore.set(hash, {
                hash,
                plan_id: planId,
                session_id: sessionId,
                first_seen: now,
                last_seen: now,
                occurrence_count: 1,
            });
            this.stats.unique_findings++;
        }
    }

    /**
     * Check if a finding is a duplicate and record it if not.
     * Combined convenience method.
     * 
     * @param finding The finding to check/record
     * @param planId Plan ID
     * @param sessionId Optional session ID
     * @returns true if this is a NEW finding (not a duplicate)
     */
    checkAndRecord(
        finding: DeduplicatableFinding,
        planId: string,
        sessionId?: string
    ): boolean {
        if (this.isDuplicate(finding)) {
            return false; // Duplicate
        }

        this.recordFinding(finding, planId, sessionId);
        return true; // New finding
    }

    // ============================================================================
    // Store Management
    // ============================================================================

    /**
     * Get the stored record for a finding hash.
     */
    getStoredFinding(hash: string): StoredFinding | undefined {
        return this.findingStore.get(hash);
    }

    /**
     * Get all stored findings for a plan.
     */
    getFindingsForPlan(planId: string): StoredFinding[] {
        return Array.from(this.findingStore.values())
            .filter(f => f.plan_id === planId);
    }

    /**
     * Remove stale findings from the store.
     * Returns the number of findings removed.
     */
    pruneStaleFindings(): number {
        const now = Date.now();
        let removed = 0;

        for (const [hash, finding] of this.findingStore.entries()) {
            const lastSeenTime = new Date(finding.last_seen).getTime();
            if (now - lastSeenTime > this.options.stale_after_ms) {
                this.findingStore.delete(hash);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Clear all stored findings.
     */
    clearStore(): void {
        this.findingStore.clear();
        this.stats = {
            total_checked: 0,
            duplicates_found: 0,
            unique_findings: 0,
        };
    }

    /**
     * Clear findings for a specific plan.
     */
    clearPlanFindings(planId: string): number {
        let removed = 0;

        for (const [hash, finding] of this.findingStore.entries()) {
            if (finding.plan_id === planId) {
                this.findingStore.delete(hash);
                removed++;
            }
        }

        return removed;
    }

    // ============================================================================
    // Statistics
    // ============================================================================

    /**
     * Get deduplication statistics.
     */
    getStats(): {
        total_checked: number;
        duplicates_found: number;
        unique_findings: number;
        duplication_rate: number;
        store_size: number;
    } {
        const duplicationRate = this.stats.total_checked > 0
            ? this.stats.duplicates_found / this.stats.total_checked
            : 0;

        return {
            ...this.stats,
            duplication_rate: duplicationRate,
            store_size: this.findingStore.size,
        };
    }

    // ============================================================================
    // Serialization (for potential persistence)
    // ============================================================================

    /**
     * Export the finding store as JSON.
     */
    exportStore(): string {
        const entries = Array.from(this.findingStore.entries());
        return JSON.stringify({
            version: 1,
            exported_at: new Date().toISOString(),
            findings: entries,
            stats: this.stats,
        }, null, 2);
    }

    /**
     * Import findings from JSON.
     */
    importStore(json: string): boolean {
        try {
            const data = JSON.parse(json);

            if (data.version !== 1 || !Array.isArray(data.findings)) {
                return false;
            }

            for (const [hash, finding] of data.findings) {
                this.findingStore.set(hash, finding);
            }

            if (data.stats) {
                this.stats = {
                    ...this.stats,
                    ...data.stats,
                };
            }

            return true;
        } catch {
            return false;
        }
    }
}
