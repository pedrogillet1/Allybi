import prisma from '../config/database';

/**
 * Detects and automatically recovers documents stuck in "processing" status
 * Runs every 5 minutes to ensure no documents get permanently stuck
 */
export async function detectAndRecoverStuckDocuments() {
  try {
    const STUCK_THRESHOLD = 10 * 60 * 1000; // 10 minutes
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD);

    // Find documents stuck in "processing" for more than 10 minutes
    const stuckDocuments = await prisma.document.findMany({
      where: {
        status: 'processing',
        updatedAt: {
          lt: stuckCutoff
        }
      }
    });

    if (stuckDocuments.length === 0) {
      console.log('✅ [Stuck Detector] No stuck documents found');
      return {
        success: true,
        stuckCount: 0,
        recovered: 0
      };
    }

    console.log(`⚠️ [Stuck Detector] Found ${stuckDocuments.length} stuck documents`);

    let recoveredCount = 0;
    for (const doc of stuckDocuments) {
      const ageMinutes = Math.floor((Date.now() - new Date(doc.updatedAt).getTime()) / 1000 / 60);
      console.log(`🔄 [Stuck Detector] Recovering: ${doc.filename} (stuck for ${ageMinutes} minutes)`);

      // Reset to pending for retry
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: 'pending',
          updatedAt: new Date() // Update timestamp to prevent immediate re-detection
        }
      });

      recoveredCount++;
      console.log(`✅ [Stuck Detector] Reset to pending: ${doc.filename}`);
    }

    console.log(`✅ [Stuck Detector] Recovered ${recoveredCount}/${stuckDocuments.length} stuck documents`);

    return {
      success: true,
      stuckCount: stuckDocuments.length,
      recovered: recoveredCount
    };

  } catch (error) {
    console.error('❌ [Stuck Detector] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

let detectorInterval: NodeJS.Timeout | null = null;

/**
 * Start the stuck document detector
 * Runs every 5 minutes
 */
export function startStuckDocumentDetector() {
  if (detectorInterval) {
    console.log('⚠️  [Stuck Detector] Already running');
    return;
  }

  console.log('🚀 [Stuck Detector] Starting (runs every 5 minutes)');

  // Run immediately on startup
  detectAndRecoverStuckDocuments();

  // Run every 5 minutes
  detectorInterval = setInterval(() => {
    detectAndRecoverStuckDocuments();
  }, 5 * 60 * 1000);
}

/**
 * Stop the stuck document detector
 */
export function stopStuckDocumentDetector() {
  if (detectorInterval) {
    clearInterval(detectorInterval);
    detectorInterval = null;
    console.log('⏹️  [Stuck Detector] Stopped');
  }
}
