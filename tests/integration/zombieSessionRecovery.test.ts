/**
 * Integration tests for zombie session detection with plan recovery
 * 
 * Tests the complete flow of zombie detection and plan persistence recovery.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ReactiveReviewService } from '../../src/reactive/ReactiveReviewService.js';
import { ContextServiceClient } from '../../src/mcp/serviceClient.js';
import { PlanningService } from '../../src/mcp/services/planningService.js';
import { ExecutionTrackingService } from '../../src/mcp/services/executionTrackingService.js';
import { PlanPersistenceService } from '../../src/mcp/services/planPersistenceService.js';
import { ReviewSession } from '../../src/reactive/index.js';

describe('Zombie Session Recovery Integration', () => {
    let service: ReactiveReviewService;
    let mockContextClient: jest.Mocked<ContextServiceClient>;
    let mockPlanningService: jest.Mocked<PlanningService>;
    let mockExecutionService: jest.Mocked<ExecutionTrackingService>;
    let mockPersistenceService: jest.Mocked<PlanPersistenceService>;

    const createMockSession = (sessionId: string, planId: string): ReviewSession => ({
        session_id: sessionId,
        plan_id: planId,
        status: 'executing',
        pr_metadata: {
            commit_hash: 'abc123',
            base_ref: 'main',
            changed_files: ['file1.ts', 'file2.ts'],
            lines_added: 100,
            lines_removed: 50,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    beforeEach(() => {
        mockContextClient = {
            getWorkspaceRoot: jest.fn(() => '/test/workspace'),
            disableCommitCache: jest.fn(),
            getCacheStats: jest.fn(() => ({ hitRate: 0.5, size: 10, commitKeyed: false, currentCommit: null })),
        } as unknown as jest.Mocked<ContextServiceClient>;

        mockPlanningService = {} as unknown as jest.Mocked<PlanningService>;
        mockExecutionService = {
            getExecutionState: jest.fn(() => ({ status: 'running' })),
            getProgress: jest.fn(() => ({ completed_steps: 2, total_steps: 5, percentage: 40 })),
            abortPlanExecution: jest.fn(),
        } as unknown as jest.Mocked<ExecutionTrackingService>;

        mockPersistenceService = {
            savePlan: jest.fn(() => Promise.resolve({ success: true, plan_id: 'test-plan' })),
            loadPlan: jest.fn(() => Promise.resolve(null)),
            listPlans: jest.fn(() => Promise.resolve([])),
            deletePlan: jest.fn(() => Promise.resolve({ success: true })),
        } as unknown as jest.Mocked<PlanPersistenceService>;

        service = new ReactiveReviewService(
            mockContextClient,
            mockPlanningService,
            mockExecutionService,
            mockPersistenceService
        );
    });

    afterEach(() => {
        service.stopCleanupTimer();
    });

    describe('Plan Recovery Flow', () => {
        it('should recover plan from disk and restore session', async () => {
            const serviceAny = service as any;
            const sessionId = 'session-with-evicted-plan';
            const planId = 'plan-123';
            const mockSession = createMockSession(sessionId, planId);
            const mockPlan = { id: planId, steps: [{ id: '1', description: 'Step 1' }], goal: 'Test goal' };

            // Set up session WITHOUT plan in memory (simulates eviction)
            serviceAny.sessions.set(sessionId, mockSession);
            serviceAny.sessionStartTimes.set(sessionId, Date.now());
            serviceAny.sessionLastActivity.set(sessionId, Date.now());
            // Note: NOT setting sessionPlans - plan is "missing"

            // Mock persistence to return the plan
            mockPersistenceService.loadPlan.mockResolvedValueOnce(mockPlan as any);

            // Call async status check
            const status = await service.getReviewStatusAsync(sessionId);

            // Verify plan was loaded from disk
            expect(mockPersistenceService.loadPlan).toHaveBeenCalledWith(planId);

            // Session should NOT be marked as failed
            expect(status?.session.status).toBe('executing');
            expect(status?.session.error).toBeUndefined();

            // Plan should now be in memory
            expect(serviceAny.sessionPlans.has(sessionId)).toBe(true);
            expect(serviceAny.sessionPlans.get(sessionId)).toEqual(mockPlan);

            // Telemetry should be present
            expect(status?.telemetry).toBeDefined();
            expect(status?.progress.total_steps).toBe(5);
        });

        it('should mark session as zombie when plan cannot be recovered', async () => {
            const serviceAny = service as any;
            const sessionId = 'session-unrecoverable';
            const planId = 'plan-not-found';
            const mockSession = createMockSession(sessionId, planId);

            // Set up session WITHOUT plan
            serviceAny.sessions.set(sessionId, mockSession);
            serviceAny.sessionStartTimes.set(sessionId, Date.now());
            serviceAny.sessionLastActivity.set(sessionId, Date.now());

            // Mock persistence to return null (plan not on disk)
            mockPersistenceService.loadPlan.mockResolvedValueOnce(null);

            // Call async status check
            const status = await service.getReviewStatusAsync(sessionId);

            // Session should be marked as failed
            expect(status?.session.status).toBe('failed');
            expect(status?.session.error).toContain('orphaned');
            expect(status?.session.error).toContain('recovery failed');
        });

        it('should handle sync status check gracefully when persistence available', () => {
            const serviceAny = service as any;
            const sessionId = 'session-sync-check';
            const planId = 'plan-456';
            const mockSession = createMockSession(sessionId, planId);

            // Set up session WITHOUT plan
            serviceAny.sessions.set(sessionId, mockSession);
            serviceAny.sessionStartTimes.set(sessionId, Date.now());
            serviceAny.sessionLastActivity.set(sessionId, Date.now());

            // Sync status check should NOT mark as zombie (defers to async)
            const status = service.getReviewStatus(sessionId);

            // Status should still be executing (not marked as failed in sync mode)
            expect(status?.session.status).toBe('executing');
        });
    });
});

