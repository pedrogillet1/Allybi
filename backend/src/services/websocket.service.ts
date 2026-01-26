/**
 * WebSocket Service - Real-time event emission
 *
 * This service provides a clean interface for emitting WebSocket events
 * to users. It works with the Socket.IO instance initialized in server.ts.
 */

import { Server as SocketIOServer } from 'socket.io';

class WebSocketService {
  private io: SocketIOServer | null = null;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  /**
   * Initialize the WebSocket service with the Socket.IO instance
   * This should be called once from server.ts after Socket.IO is set up
   */
  initialize(socketIOInstance: SocketIOServer) {
    this.io = socketIOInstance;
    console.log('✅ [WebSocket Service] Initialized');
  }

  /**
   * Get the Socket.IO instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: string, data: any): boolean {
    if (!this.io) {
      console.warn('⚠️  [WebSocket] Not initialized, cannot broadcast');
      return false;
    }

    this.io.emit(event, data);
    console.log(`📡 [WebSocket] Broadcast: ${event}`);
    return true;
  }

  /**
   * Emit event to specific user (all their connected sockets)
   */
  sendToUser(userId: string, event: string, data: any): boolean {
    if (!this.io) {
      console.warn('⚠️  [WebSocket] Not initialized, cannot send to user');
      return false;
    }

    this.io.to(`user:${userId}`).emit(event, data);
    console.log(`📤 [WebSocket] Sent to user ${userId.substring(0, 8)}...: ${event}`);
    return true;
  }

  /**
   * Emit event to specific socket ID
   */
  emit(socketId: string, event: string, data: any): boolean {
    if (!this.io) {
      console.warn('⚠️  [WebSocket] Not initialized, cannot emit');
      return false;
    }

    this.io.to(socketId).emit(event, data);
    return true;
  }

  /**
   * Get connected socket count for user
   */
  getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  /**
   * Track user socket connection
   */
  addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  /**
   * Remove user socket connection
   */
  removeUserSocket(userId: string, socketId: string) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }
}

// Singleton instance
const websocketService = new WebSocketService();

/**
 * Emit document-related event to user
 */
export const emitDocumentEvent = (userId: string, event: string, documentId?: string): boolean => {
  console.log(
    `📡 [WebSocket] Emitting document-${event} to user ${userId.substring(0, 8)}...`,
    documentId ? `(doc: ${documentId.substring(0, 8)}...)` : ''
  );

  // Emit generic documents-changed event for UI refresh
  websocketService.sendToUser(userId, 'documents-changed', { event, documentId });

  // Emit specific event based on action
  if (event === 'created') {
    websocketService.sendToUser(userId, 'document-created', { documentId });
  } else if (event === 'deleted') {
    websocketService.sendToUser(userId, 'document-deleted', { documentId });
  } else if (event === 'moved') {
    websocketService.sendToUser(userId, 'document-moved', { documentId });
  } else if (event === 'updated') {
    websocketService.sendToUser(userId, 'document-updated', { documentId });
  }

  return true;
};

// ✅ FIX #4: Delayed document event emission for replication lag
// This allows database read replicas to catch up before frontend refetches
const REPLICATION_DELAY_MS = 2000; // 2 second delay for database replication

/**
 * Emit document-related event to user with delay for replication
 * Use this for 'created' events to allow database replication to complete
 */
export const emitDocumentEventDelayed = (userId: string, event: string, documentId?: string): void => {
  console.log(
    `⏳ [WebSocket] Scheduling delayed document-${event} to user ${userId.substring(0, 8)}... (delay: ${REPLICATION_DELAY_MS}ms)`,
    documentId ? `(doc: ${documentId.substring(0, 8)}...)` : ''
  );

  setTimeout(() => {
    emitDocumentEvent(userId, event, documentId);
  }, REPLICATION_DELAY_MS);
};

/**
 * Emit folder-related event to user
 */
export const emitFolderEvent = (userId: string, event: string, folderId?: string): boolean => {
  console.log(
    `📡 [WebSocket] Emitting folder-${event} to user ${userId.substring(0, 8)}...`,
    folderId ? `(folder: ${folderId.substring(0, 8)}...)` : ''
  );

  // Emit generic folders-changed event for UI refresh
  websocketService.sendToUser(userId, 'folders-changed', { event, folderId });

  // Emit specific event based on action
  if (event === 'created') {
    websocketService.sendToUser(userId, 'folder-created', { folderId });
  } else if (event === 'deleted') {
    websocketService.sendToUser(userId, 'folder-deleted', { folderId });
  }

  return true;
};

/**
 * Emit generic event to user
 */
export const emitToUser = (userId: string, event: string, data: any): boolean => {
  console.log(`📡 [WebSocket] Emitting ${event} to user ${userId.substring(0, 8)}...`);
  return websocketService.sendToUser(userId, event, data);
};

/**
 * Get Socket.IO instance
 */
export const getIO = (): SocketIOServer | null => {
  return websocketService.getIO();
};

export default websocketService;
