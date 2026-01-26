/**
 * Files Service Module
 *
 * Contains all file and folder related services:
 * - fileInventory: list/filter/sort/group files
 * - fileActionResolver: resolve file targets and disambiguation
 * - fileManagement: create/move/rename/delete folders
 * - folderNavigation: folder navigation and breadcrumbs
 * - folderPath: folder path utilities
 */

// Re-export everything for backward compatibility
export * from './fileInventory.service';
export * from './fileManagement.service';
export * from './fileActionResolver.service';
export * from './folderNavigation.service';
export * from './folderPath.service';

// Named exports for common imports
export { fileSearchService } from './fileInventory.service';
export { FileActionResolverService, getFileActionResolver } from './fileActionResolver.service';
