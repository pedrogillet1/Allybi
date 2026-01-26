import { Router } from 'express';
import prisma from '../config/database';
import { runManualCleanup } from '../jobs/orphanCleanup.scheduler';

const router = Router();

// DEV ONLY: Get verification code for testing
router.get('/get-verification-code/:email', async (req, res): Promise<any> => {
  try {
    const { email } = req.params;

    const pendingUser = await prisma.pendingUser.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        email: true,
        emailCode: true,
        expiresAt: true,
        emailVerified: true,
      }
    });

    if (!pendingUser) {
      return res.status(404).json({ error: 'No pending user found' });
    }

    res.json({
      email: pendingUser.email,
      code: pendingUser.emailCode,
      expiresAt: pendingUser.expiresAt,
      verified: pendingUser.emailVerified
    });
  } catch (error) {
    console.error('Error getting verification code:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DEV/ADMIN: Run manual orphan cleanup
// This endpoint triggers immediate cleanup of orphaned data in:
// - Pinecone vectors (documents deleted but vectors remain)
// - GCS/S3 files (documents deleted but files remain)
// - PostgreSQL embeddings (cascade delete failures)
router.post('/run-orphan-cleanup', async (req, res) => {
  try {
    console.log('🧹 [API] Manual orphan cleanup triggered');

    const report = await runManualCleanup();

    res.json({
      success: true,
      message: 'Orphan cleanup completed',
      report: {
        timestamp: report.timestamp,
        pinecone: {
          orphanedVectors: report.pinecone.orphanedVectors,
          deletedVectors: report.pinecone.deletedVectors,
          errors: report.pinecone.errors.length,
        },
        storage: {
          orphanedFiles: report.storage.orphanedFiles,
          deletedFiles: report.storage.deletedFiles,
          errors: report.storage.errors.length,
        },
        embeddings: {
          orphanedEmbeddings: report.embeddings.orphanedEmbeddings,
          deletedEmbeddings: report.embeddings.deletedEmbeddings,
          errors: report.embeddings.errors.length,
        },
      },
    });
  } catch (error: any) {
    console.error('❌ [API] Orphan cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
