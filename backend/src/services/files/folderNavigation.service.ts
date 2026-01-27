/**
 * Folder Navigation Service
 *
 * Provides organized, hierarchical folder navigation with clear visual structure,
 * full paths, and actionable navigation suggestions.
 *
 * Design Principles:
 * - Visual hierarchy with tree structure
 * - Full paths for all folders (trabalhos/test/work1/)
 * - Clear sections (Top-Level, Hierarchy, Actions)
 * - Breadcrumb navigation
 * - Actionable examples with real folder names
 */

// pickFileActionMessage is a conceptual function — use inline microcopy selection
const pickFileActionMessage = (..._args: any[]): string => '';

interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  emoji?: string | null;
  _count?: {
    documents: number;
  };
  documents?: any[];
  subfolders?: any[];
}

interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
  depth: number;
  path: string;
  isLast: boolean;
}

// ============================================================================
// FOLDER LISTING (All Folders)
// ============================================================================

/**
 * Format complete folder listing with hierarchy
 * Used when user asks "which folders do I have?" or "show my folders"
 */
export function formatFolderListingResponse(folders: Folder[], language: 'en' | 'pt' | 'es' = 'en'): string {
  if (folders.length === 0) {
    return pickFileActionMessage('no_folders', language, `folders_${Date.now()}`, { includeSuggestion: true });
  }

  // Build folder tree
  const tree = buildFolderTree(folders);
  const topLevelFolders = tree.filter(node => node.depth === 0);

  // Count total files
  const totalFiles = folders.reduce((sum, f) => sum + (f._count?.documents || 0), 0);

  let response = `## Your Folder Structure\n\n`;
  response += `You have **${folders.length} folder${folders.length > 1 ? 's' : ''}** `;
  response += `organized in **${topLevelFolders.length} top-level folder${topLevelFolders.length > 1 ? 's' : ''}**`;
  if (totalFiles > 0) {
    response += ` with **${totalFiles} file${totalFiles > 1 ? 's' : ''}** total`;
  }
  response += `:\n\n`;

  // Top-level folders summary
  response += `### Top-Level Folders\n\n`;
  topLevelFolders.forEach(node => {
    const fileCount = node.folder._count?.documents || 0;
    const subfolderCount = node.children.length;
    response += `**${node.folder.name}** → ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    if (subfolderCount > 0) {
      response += `, ${subfolderCount} subfolder${subfolderCount !== 1 ? 's' : ''}`;
    }
    response += `\n`;
  });

  response += `\n---\n\n`;

  // Complete hierarchy
  response += `### Complete Hierarchy\n\n`;
  response += buildFolderTreeDisplay(tree);

  response += `\n---\n\n`;

  // Quick actions
  response += `### Quick Actions\n\n`;
  response += `Explore any folder:\n`;

  // Add examples with real folder names
  const exampleFolders = topLevelFolders.slice(0, 2);
  exampleFolders.forEach(node => {
    response += `- "Show me ${node.folder.name} folder"\n`;
    if (node.children.length > 0) {
      const firstChild = node.children[0];
      response += `- "What's in ${node.folder.name}/${firstChild.folder.name}?"\n`;
    }
  });

  return response;
}

// ============================================================================
// FOLDER CONTENT (Single Folder)
// ============================================================================

/**
 * Format single folder content with files, subfolders, and navigation
 * Used when user asks "what's in trabalhos folder?" or "show me trabalhos"
 */
export function formatFolderContentResponse(
  folder: Folder,
  allFolders: Folder[]
): string {
  const breadcrumb = buildBreadcrumbPath(folder, allFolders);
  const fullPath = breadcrumb.join(' / ');

  const fileCount = folder.documents?.length || folder._count?.documents || 0;
  const subfolderCount = folder.subfolders?.length || 0;

  let response = `## ${folder.name}/\n\n`;
  response += `**Location:** ${fullPath}\n`;
  response += `**Contains:** ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
  if (subfolderCount > 0) {
    response += `, ${subfolderCount} subfolder${subfolderCount !== 1 ? 's' : ''}`;
  }
  response += `\n\n---\n\n`;

  // Files section
  if (fileCount > 0 && folder.documents) {
    response += `### Files (${fileCount})\n\n`;
    folder.documents.slice(0, 20).forEach(doc => {
      response += `- **${doc.filename}**`;
      if (doc.mimeType) {
        const fileType = getFileTypeLabel(doc.mimeType);
        response += ` (${fileType}`;
        if (doc.fileSize) {
          response += `, ${formatFileSize(doc.fileSize)}`;
        }
        response += `)`;
      }
      response += `\n`;
    });

    if (fileCount > 20) {
      response += `\n*...and ${fileCount - 20} more file${fileCount - 20 !== 1 ? 's' : ''}*\n`;
    }

    response += `\n---\n\n`;
  }

  // Subfolders section
  if (subfolderCount > 0 && folder.subfolders) {
    response += `### Subfolders (${subfolderCount})\n\n`;
    folder.subfolders.forEach(sf => {
      const sfFileCount = sf._count?.documents || 0;
      const sfEmoji = sf.emoji || '';
      response += `${sfEmoji} **${sf.name}/** → ${sfFileCount} file${sfFileCount !== 1 ? 's' : ''}\n`;
    });

    response += `\n---\n\n`;
  }

  // Navigation section
  response += `### Navigate\n\n`;

  if (subfolderCount > 0 && folder.subfolders) {
    response += `**Go deeper:**\n`;
    folder.subfolders.slice(0, 3).forEach(sf => {
      const subPath = breadcrumb.slice(1).concat(sf.name).join('/');
      response += `- "Show me ${subPath} folder"\n`;
    });
    response += `\n`;
  }

  if (folder.parentFolderId) {
    const parent = allFolders.find(f => f.id === folder.parentFolderId);
    if (parent) {
      response += `**Go up:**\n`;
      response += `- "Show me ${parent.name} folder" (parent)\n`;
      response += `\n`;
    }
  }

  response += `**Search within:**\n`;
  const searchPath = breadcrumb.slice(1).join('/');
  response += `- "Find files about [topic] in ${searchPath}"\n`;

  return response;
}

// ============================================================================
// FOLDER NOT FOUND
// ============================================================================

/**
 * Format folder not found response with helpful suggestions
 * Used when user searches for non-existent folder
 */
export function formatFolderNotFoundResponse(
  searchedName: string,
  availableFolders: Folder[],
  language: 'en' | 'pt' | 'es' = 'en'
): string {
  const notFoundMsg = pickFileActionMessage('folder_not_found', language, `notfound_${Date.now()}`, {
    placeholders: { '{{folderName}}': searchedName }
  });

  let response = `${notFoundMsg}\n\n`;

  if (availableFolders.length === 0) {
    const noFoldersMsg = pickFileActionMessage('no_folders', language, `nofolders_${Date.now()}`, { includeSuggestion: true });
    response += `${noFoldersMsg}\n`;
    return response;
  }

  // Show available folders
  const tree = buildFolderTree(availableFolders);
  const topLevelFolders = tree.filter(node => node.depth === 0);

  response += `### Your Current Folders\n\n`;
  response += `**Top-Level Folders (${topLevelFolders.length}):**\n`;
  topLevelFolders.forEach(node => {
    const fileCount = node.folder._count?.documents || 0;
    const subfolderCount = node.children.length;
    response += `- **${node.folder.name}** → ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    if (subfolderCount > 0) {
      response += `, ${subfolderCount} subfolder${subfolderCount !== 1 ? 's' : ''}`;
    }
    response += `\n`;
  });

  response += `\n**All Folders (${availableFolders.length} total):**\n\n`;
  response += buildFolderTreeDisplay(tree);
  response += `\n\n`;

  response += `---\n\n`;

  // Action options
  response += `### What Would You Like To Do?\n\n`;

  response += `**Option 1:** Explore an existing folder\n`;
  topLevelFolders.slice(0, 2).forEach(node => {
    response += `- "Show me ${node.folder.name} folder"\n`;
  });
  response += `\n`;

  response += `**Option 2:** Create the new folder\n`;
  response += `- "Create folder ${searchedName}"\n`;
  response += `\n`;

  response += `**Option 3:** Search by content\n`;
  response += `- "Find files about [topic]"\n`;

  return response;
}

// ============================================================================
// EMPTY FOLDER
// ============================================================================

/**
 * Format empty folder response
 * Used when folder has no files but may have subfolders
 */
export function formatEmptyFolderResponse(
  folder: Folder,
  allFolders: Folder[]
): string {
  const breadcrumb = buildBreadcrumbPath(folder, allFolders);
  const fullPath = breadcrumb.join(' / ');
  const subfolderCount = folder.subfolders?.length || 0;

  let response = `## ${folder.name}/\n\n`;
  response += `**Location:** ${fullPath}\n`;
  response += `**Status:** Empty (ready for files)\n\n`;
  response += `---\n\n`;

  // Folder details
  response += `### Folder Details\n\n`;

  if (folder.parentFolderId) {
    const parent = allFolders.find(f => f.id === folder.parentFolderId);
    if (parent) {
      response += `- **Parent Folder:** ${parent.name}/\n`;
    }
  } else {
    response += `- **Parent Folder:** Root\n`;
  }

  response += `- **Subfolders:** ${subfolderCount}\n`;
  response += `- **Files:** 0\n\n`;

  // Show subfolders if any
  if (subfolderCount > 0 && folder.subfolders) {
    response += `**Subfolders:**\n`;
    folder.subfolders.forEach(sf => {
      const sfFileCount = sf._count?.documents || 0;
      response += `- **${sf.name}/** (${sfFileCount} file${sfFileCount !== 1 ? 's' : ''})\n`;
    });
    response += `\n`;
  }

  response += `---\n\n`;

  // Actions
  response += `### What You Can Do\n\n`;

  response += `**Option 1:** Upload files here\n`;
  response += `- Drag and drop files to organize them in this folder\n\n`;

  response += `**Option 2:** Create subfolders\n`;
  const folderPath = breadcrumb.slice(1).join('/');
  response += `- "Create folder ${folderPath}/2024"\n`;
  response += `- "Create folder ${folderPath}/archive"\n\n`;

  if (folder.parentFolderId) {
    const parent = allFolders.find(f => f.id === folder.parentFolderId);
    if (parent) {
      response += `**Option 3:** Go back to parent\n`;
      response += `- "Show me ${parent.name} folder"\n\n`;
    }
  }

  response += `**Option 4:** Delete if not needed\n`;
  response += `- "Delete folder ${folder.name}"\n`;

  return response;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build breadcrumb path from folder to root
 * Returns: ['Root', 'trabalhos', 'test', 'work1']
 */
function buildBreadcrumbPath(folder: Folder, allFolders: Folder[]): string[] {
  const path: string[] = [];
  let current: Folder | undefined = folder;

  while (current) {
    path.unshift(current.name);
    if (current.parentFolderId) {
      current = allFolders.find(f => f.id === current!.parentFolderId);
    } else {
      break;
    }
  }

  path.unshift('Root');
  return path;
}

/**
 * Build folder tree from flat folder list
 */
function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();
  const rootNodes: FolderTreeNode[] = [];

  // Create nodes
  folders.forEach(folder => {
    folderMap.set(folder.id, {
      folder,
      children: [],
      depth: 0,
      path: folder.name,
      isLast: false
    });
  });

  // Build tree structure
  folders.forEach(folder => {
    const node = folderMap.get(folder.id)!;

    if (folder.parentFolderId) {
      const parent = folderMap.get(folder.parentFolderId);
      if (parent) {
        parent.children.push(node);
        node.depth = parent.depth + 1;
        node.path = parent.path + '/' + folder.name;
      } else {
        rootNodes.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  // Mark last children
  const markLastChildren = (nodes: FolderTreeNode[]) => {
    if (nodes.length > 0) {
      nodes[nodes.length - 1].isLast = true;
    }
    nodes.forEach(node => markLastChildren(node.children));
  };
  markLastChildren(rootNodes);

  return rootNodes;
}

/**
 * Build visual tree display with symbols
 */
function buildFolderTreeDisplay(tree: FolderTreeNode[]): string {
  let result = '';

  const renderNode = (node: FolderTreeNode, prefix: string, isLast: boolean) => {
    const fileCount = node.folder._count?.documents || 0;
    const connector = isLast ? '└── ' : '├── ';
    const folderLine = prefix + connector + '**' + node.folder.name + '/** (' + fileCount + ' file' + (fileCount !== 1 ? 's' : '') + ')\n';
    result += folderLine;

    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      renderNode(child, newPrefix, index === node.children.length - 1);
    });
  };

  tree.forEach((node, index) => {
    const fileCount = node.folder._count?.documents || 0;
    result += '**' + node.folder.name + '/** (' + fileCount + ' file' + (fileCount !== 1 ? 's' : '') + ')\n';

    node.children.forEach((child, childIndex) => {
      renderNode(child, '', childIndex === node.children.length - 1);
    });

    if (index < tree.length - 1) {
      result += '\n';
    }
  });

  return result;
}

/**
 * Get human-readable file type label from MIME type
 */
function getFileTypeLabel(mimeType: string): string {
  const typeMap: { [key: string]: string } = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'application/vnd.ms-powerpoint': 'PowerPoint',
    'text/plain': 'Text',
    'text/csv': 'CSV',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
  };

  return typeMap[mimeType] || 'File';
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}
