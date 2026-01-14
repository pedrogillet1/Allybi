/**
 * PERFECT DELETE: Deletion Service Tests
 * Tests for idempotent, cross-tab safe deletion jobs
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import prisma from '../config/database';
import * as deletionService from '../services/deletion.service';
import { DeletionJobStatus, DeletionTargetType } from '@prisma/client';

// Test user and data IDs
const TEST_USER_ID = 'test-user-deletion-' + Date.now();
const TEST_FOLDER_ID = 'test-folder-deletion-' + Date.now();
const TEST_DOC_ID = 'test-doc-deletion-' + Date.now();

describe('PERFECT DELETE: Deletion Service', () => {
  // Setup: Create test user, folder, and document
  beforeAll(async () => {
    // Create test user
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: `test-deletion-${Date.now()}@test.com`,
        passwordHash: 'test-hash',
        isEmailVerified: true,
      },
    });

    // Create test folder
    await prisma.folder.upsert({
      where: { id: TEST_FOLDER_ID },
      update: {},
      create: {
        id: TEST_FOLDER_ID,
        name: 'Test Deletion Folder',
        userId: TEST_USER_ID,
        emoji: '🗑️',
      },
    });

    // Create test document
    await prisma.document.upsert({
      where: { id: TEST_DOC_ID },
      update: {},
      create: {
        id: TEST_DOC_ID,
        filename: 'test-deletion.txt',
        mimeType: 'text/plain',
        fileSize: 100,
        userId: TEST_USER_ID,
        folderId: TEST_FOLDER_ID,
        encryptedFilename: 'enc-test-deletion.txt',
        status: 'ready',
        fileHash: 'test-hash',
      },
    });
  });

  // Cleanup: Remove test data
  afterAll(async () => {
    // Delete test deletion jobs
    await prisma.deletionJob.deleteMany({
      where: { userId: TEST_USER_ID },
    });

    // Delete test documents
    await prisma.document.deleteMany({
      where: { userId: TEST_USER_ID },
    });

    // Delete test folders
    await prisma.folder.deleteMany({
      where: { userId: TEST_USER_ID },
    });

    // Delete test user
    await prisma.user.deleteMany({
      where: { id: TEST_USER_ID },
    });
  });

  // Clean up jobs before each test
  beforeEach(async () => {
    await prisma.deletionJob.deleteMany({
      where: { userId: TEST_USER_ID },
    });
  });

  describe('createDeletionJob', () => {
    it('should create a new deletion job for a document', async () => {
      const result = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID,
        'test-deletion.txt'
      );

      expect(result.job).toBeDefined();
      expect(result.job.userId).toBe(TEST_USER_ID);
      expect(result.job.targetType).toBe('document');
      expect(result.job.targetId).toBe(TEST_DOC_ID);
      expect(result.job.status).toBe('queued');
      expect(result.isExisting).toBe(false);
    });

    it('should be idempotent - return existing job for same target', async () => {
      // First call creates the job
      const result1 = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      expect(result1.isExisting).toBe(false);

      // Second call should return existing job
      const result2 = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      expect(result2.isExisting).toBe(true);
      expect(result2.job.id).toBe(result1.job.id);
    });

    it('should reset failed jobs on retry', async () => {
      // Create a job and mark it as failed
      const result1 = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      await prisma.deletionJob.update({
        where: { id: result1.job.id },
        data: {
          status: 'failed',
          lastError: 'Test failure',
          attempts: 3,
        },
      });

      // New call should reset the failed job
      const result2 = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      expect(result2.job.status).toBe('queued');
      expect(result2.job.attempts).toBe(0);
      expect(result2.isExisting).toBe(true);
    });
  });

  describe('getJobProgress', () => {
    it('should return job progress with correct percentages', async () => {
      const createResult = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      // Update job with progress
      await prisma.deletionJob.update({
        where: { id: createResult.job.id },
        data: {
          docsTotal: 10,
          docsDone: 5,
          filesDone: 5,
          vectorsDone: 5,
        },
      });

      const progress = await deletionService.getJobProgress(createResult.job.id, TEST_USER_ID);

      expect(progress).toBeDefined();
      expect(progress?.progress.docsTotal).toBe(10);
      expect(progress?.progress.docsDone).toBe(5);
      expect(progress?.progress.percentComplete).toBeGreaterThan(0);
    });

    it('should return null for non-existent job', async () => {
      const progress = await deletionService.getJobProgress('non-existent-id', TEST_USER_ID);
      expect(progress).toBeNull();
    });

    it('should return null for job belonging to different user', async () => {
      const createResult = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      const progress = await deletionService.getJobProgress(createResult.job.id, 'different-user');
      expect(progress).toBeNull();
    });
  });

  describe('retryJob', () => {
    it('should only allow retrying failed jobs', async () => {
      const createResult = await deletionService.createDeletionJob(
        TEST_USER_ID,
        'document',
        TEST_DOC_ID
      );

      // Job is queued, not failed
      const retryResult = await deletionService.retryJob(createResult.job.id, TEST_USER_ID);
      expect(retryResult).toBeNull();

      // Mark as failed
      await prisma.deletionJob.update({
        where: { id: createResult.job.id },
        data: { status: 'failed' },
      });

      // Now retry should work
      const retryResult2 = await deletionService.retryJob(createResult.job.id, TEST_USER_ID);
      expect(retryResult2).toBeDefined();
      expect(retryResult2?.status).toBe('queued');
    });
  });

  describe('getUserJobs', () => {
    it('should return all jobs for a user', async () => {
      // Create multiple jobs
      await deletionService.createDeletionJob(TEST_USER_ID, 'document', TEST_DOC_ID);

      const jobs = await deletionService.getUserJobs(TEST_USER_ID);

      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every(j => j.targetType === 'document' || j.targetType === 'folder')).toBe(true);
    });

    it('should filter jobs by status', async () => {
      const createResult = await deletionService.createDeletionJob(TEST_USER_ID, 'document', TEST_DOC_ID);

      // Mark as completed
      await prisma.deletionJob.update({
        where: { id: createResult.job.id },
        data: { status: 'completed' },
      });

      const queuedJobs = await deletionService.getUserJobs(TEST_USER_ID, 'queued');
      const completedJobs = await deletionService.getUserJobs(TEST_USER_ID, 'completed');

      expect(queuedJobs.length).toBe(0);
      expect(completedJobs.length).toBe(1);
    });
  });
});
