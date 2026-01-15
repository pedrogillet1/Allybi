/**
 * REFACTORED CODE SNIPPETS
 * Copy these exact code blocks into your files to complete the refactoring
 */

// ============================================================================
// DOCUMENTS.JSX - Complete Refactored Sections
// ============================================================================

// ----------------------------------------------------------------------------
// 1. IMPORTS SECTION (Replace lines ~1-60)
// ----------------------------------------------------------------------------
// REMOVE these imports:
// import MoveToCategoryModal from './MoveToCategoryModal';
// import CreateCategoryModal from './CreateCategoryModal';

// ADD these imports:
import CategoryPickerModal from './CategoryPickerModal';
import CreateCategoryModalSimple from './CreateCategoryModalSimple';
import { useCategoryMove } from '../hooks/useCategoryMove';

// ----------------------------------------------------------------------------
// 2. STATE DECLARATIONS (Replace lines ~104-123)
// ----------------------------------------------------------------------------
// REMOVE:
// const [showCategoryModal, setShowCategoryModal] = useState(false);
// const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
// const [selectedCategoryId, setSelectedCategoryId] = useState(null);
// const [showCreateFromMoveModal, setShowCreateFromMoveModal] = useState(false);

// REPLACE WITH:
// Universal category picker state
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [categoryPickerContext, setCategoryPickerContext] = useState({
  documentIds: [],
  entityType: 'document',
  isSelectMode: false
});
const [showCreateCategory, setShowCreateCategory] = useState(false);

// ----------------------------------------------------------------------------
// 3. HOOKS SECTION (Add after useDocuments hook ~line 84)
// ----------------------------------------------------------------------------
// Universal move operations
const {
  moveDocumentsToCategory,
  createCategoryAndMove,
  getAvailableCategories
} = useCategoryMove();

// ----------------------------------------------------------------------------
// 4. HANDLER FUNCTIONS (Replace lines ~382-458)
// ----------------------------------------------------------------------------
// REMOVE ALL OF:
// - handleAddToCategory
// - handleCategorySelection
// - handleCreateCategoryFromMove

// REPLACE WITH:

/**
 * Universal handler: Open category picker modal
 * Supports single document, bulk documents, and select mode
 */
const handleOpenCategoryPicker = (doc = null) => {
  const docsToMove = isSelectMode
    ? Array.from(selectedDocuments)
    : (doc ? [doc.id] : []);

  if (docsToMove.length === 0) {
    console.warn('No documents selected for move');
    return;
  }

  setCategoryPickerContext({
    documentIds: docsToMove,
    entityType: docsToMove.length > 1 ? 'documents' : 'document',
    isSelectMode: isSelectMode
  });

  setShowCategoryPicker(true);
  setOpenDropdownId(null); // Close any open dropdowns
};

/**
 * Universal handler: Move documents to selected category
 * Called when user confirms category selection
 */
const handleMoveToCategory = async (categoryId) => {
  // Close modal immediately for snappy UX
  setShowCategoryPicker(false);

  const { documentIds, isSelectMode: wasSelectMode } = categoryPickerContext;

  try {
    // Use universal move function (handles toasts, optimistic updates, errors)
    await moveDocumentsToCategory(documentIds, categoryId);

    // Clear selection if we were in select mode
    if (wasSelectMode) {
      clearSelection();
      toggleSelectMode();
    }
  } catch (error) {
    // Error already handled and displayed by useCategoryMove hook
    console.error('Move operation failed:', error);
  }

  // Reset context
  setCategoryPickerContext({
    documentIds: [],
    entityType: 'document',
    isSelectMode: false
  });
};

/**
 * Universal handler: Create new category and move documents
 * Called when user creates a category from the category picker
 */
const handleCreateCategory = async (name, emoji) => {
  const { documentIds, isSelectMode: wasSelectMode } = categoryPickerContext;

  // Close both modals immediately for snappy UX
  setShowCreateCategory(false);
  setShowCategoryPicker(false);

  try {
    // Create category and move documents (handles toasts and errors)
    await createCategoryAndMove(name, emoji, documentIds);

    // Clear selection if we were in select mode
    if (wasSelectMode) {
      clearSelection();
      toggleSelectMode();
    }
  } catch (error) {
    // Error already handled by useCategoryMove hook
    console.error('Create category operation failed:', error);
  }

  // Reset context
  setCategoryPickerContext({
    documentIds: [],
    entityType: 'document',
    isSelectMode: false
  });
};

// ----------------------------------------------------------------------------
// 5. DOCUMENT DROPDOWN ACTION (Update line ~2124)
// ----------------------------------------------------------------------------
// FIND the "Add to Category" button in document dropdown and UPDATE:
<button
  onClick={(e) => {
    e.stopPropagation();
    handleOpenCategoryPicker(doc); // CHANGED: was handleAddToCategory(doc)
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    width: '100%',
    color: '#32302C',
    fontSize: 14,
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: '500',
    transition: 'background 0.2s'
  }}
  onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
>
  <AddIcon style={{ width: 20, height: 20 }} />
  {t('common.addToCategory')}
</button>

// ----------------------------------------------------------------------------
// 6. BULK ACTIONS TOOLBAR (If exists - update "Move to Category" button)
// ----------------------------------------------------------------------------
// FIND any bulk action button for "Move to Category" and UPDATE to:
<button
  onClick={handleOpenCategoryPicker} // No argument needed - uses selectedDocuments from context
  style={{
    /* your existing styles */
  }}
>
  <AddIcon style={{ width: 20, height: 20 }} />
  {t('bulkActions.moveToCategory')}
</button>

// ----------------------------------------------------------------------------
// 7. MODAL COMPONENTS (Replace lines ~2267-2307)
// ----------------------------------------------------------------------------
// REMOVE ALL OF:
// - CreateCategoryModal for move flow
// - MoveToCategoryModal

// REPLACE WITH:

{/* Universal Category Picker Modal */}
<CategoryPickerModal
  isOpen={showCategoryPicker}
  onClose={() => {
    setShowCategoryPicker(false);
    setCategoryPickerContext({
      documentIds: [],
      entityType: 'document',
      isSelectMode: false
    });
  }}
  categories={getAvailableCategories().map(f => ({
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    _count: {
      documents: getDocumentCountByFolder(f.id)
    }
  }))}
  onMove={handleMoveToCategory}
  onCreateNew={() => setShowCreateCategory(true)}
  selectedCount={categoryPickerContext.documentIds.length}
  entityType={categoryPickerContext.entityType}
/>

{/* Create Category Modal */}
<CreateCategoryModalSimple
  isOpen={showCreateCategory}
  onClose={() => setShowCreateCategory(false)}
  onCreate={handleCreateCategory}
/>

// ============================================================================
// DOCUMENTSPAGE.JSX - Nearly Identical to Documents.jsx
// ============================================================================
// Apply the exact same changes as Documents.jsx above.
// The code is nearly identical, just copy the patterns.

// ============================================================================
// FILETYPEDETAIL.JSX - Similar Pattern
// ============================================================================

// IMPORTS
import CategoryPickerModal from './CategoryPickerModal';
import CreateCategoryModalSimple from './CreateCategoryModalSimple';
import { useCategoryMove } from '../hooks/useCategoryMove';

// STATE
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [documentIdsToMove, setDocumentIdsToMove] = useState([]);
const [showCreateCategory, setShowCreateCategory] = useState(false);

// HOOKS
const {
  moveDocumentsToCategory,
  createCategoryAndMove,
  getAvailableCategories
} = useCategoryMove();

// HANDLERS
const handleOpenCategoryPicker = (documentIds) => {
  setDocumentIdsToMove(documentIds);
  setShowCategoryPicker(true);
};

const handleMoveToCategory = async (categoryId) => {
  setShowCategoryPicker(false);
  try {
    await moveDocumentsToCategory(documentIdsToMove, categoryId);
  } catch (error) {
    console.error('Move failed:', error);
  }
  setDocumentIdsToMove([]);
};

const handleCreateCategory = async (name, emoji) => {
  setShowCreateCategory(false);
  setShowCategoryPicker(false);
  try {
    await createCategoryAndMove(name, emoji, documentIdsToMove);
  } catch (error) {
    console.error('Create failed:', error);
  }
  setDocumentIdsToMove([]);
};

// MODALS
<CategoryPickerModal
  isOpen={showCategoryPicker}
  onClose={() => {
    setShowCategoryPicker(false);
    setDocumentIdsToMove([]);
  }}
  categories={getAvailableCategories().map(f => ({
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    _count: { documents: getDocumentCountByFolder(f.id) }
  }))}
  onMove={handleMoveToCategory}
  onCreateNew={() => setShowCreateCategory(true)}
  selectedCount={documentIdsToMove.length}
  entityType={documentIdsToMove.length > 1 ? 'documents' : 'document'}
/>

<CreateCategoryModalSimple
  isOpen={showCreateCategory}
  onClose={() => setShowCreateCategory(false)}
  onCreate={handleCreateCategory}
/>

// ============================================================================
// CATEGORYDETAIL.JSX - Folder Move Support
// ============================================================================

// IMPORTS (same as above)
import CategoryPickerModal from './CategoryPickerModal';
import CreateCategoryModalSimple from './CreateCategoryModalSimple';
import { useCategoryMove } from '../hooks/useCategoryMove';

// STATE
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [moveContext, setMoveContext] = useState({
  type: null, // 'document' or 'folder'
  ids: []
});
const [showCreateCategory, setShowCreateCategory] = useState(false);

// HOOKS
const {
  moveDocumentsToCategory,
  moveFolderToCategory,
  createCategoryAndMove,
  getAvailableCategories
} = useCategoryMove();

// HANDLERS
const handleMoveFolder = () => {
  setMoveContext({
    type: 'folder',
    ids: [currentFolderId] // or folderId you want to move
  });
  setShowCategoryPicker(true);
};

const handleMoveDocuments = (documentIds) => {
  setMoveContext({
    type: 'document',
    ids: documentIds
  });
  setShowCategoryPicker(true);
};

const handleMoveToCategory = async (categoryId) => {
  setShowCategoryPicker(false);

  try {
    if (moveContext.type === 'folder') {
      await moveFolderToCategory(moveContext.ids[0], categoryId);
      // Navigate away or refresh after folder move
      navigate('/documents');
    } else {
      await moveDocumentsToCategory(moveContext.ids, categoryId);
    }
  } catch (error) {
    console.error('Move failed:', error);
  }

  setMoveContext({ type: null, ids: [] });
};

// MODALS (similar to above, adjust entityType based on moveContext.type)
<CategoryPickerModal
  isOpen={showCategoryPicker}
  onClose={() => {
    setShowCategoryPicker(false);
    setMoveContext({ type: null, ids: [] });
  }}
  categories={getAvailableCategories().map(f => ({
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    _count: { documents: getDocumentCountByFolder(f.id) }
  }))}
  onMove={handleMoveToCategory}
  onCreateNew={() => setShowCreateCategory(true)}
  selectedCount={moveContext.ids.length}
  entityType={moveContext.type === 'folder' ? 'folder' : (moveContext.ids.length > 1 ? 'documents' : 'document')}
/>

// ============================================================================
// DOCUMENTVIEWER.JSX - Single Document Context
// ============================================================================

// IMPORTS (same as above)
// STATE
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [showCreateCategory, setShowCreateCategory] = useState(false);

// HOOKS (same as above)

// HANDLERS - simplified for single document
const handleOpenCategoryPicker = () => {
  setShowCategoryPicker(true);
};

const handleMoveToCategory = async (categoryId) => {
  setShowCategoryPicker(false);
  try {
    await moveDocumentsToCategory([documentId], categoryId); // documentId from component props
    // Optionally navigate away after move
  } catch (error) {
    console.error('Move failed:', error);
  }
};

const handleCreateCategory = async (name, emoji) => {
  setShowCreateCategory(false);
  setShowCategoryPicker(false);
  try {
    await createCategoryAndMove(name, emoji, [documentId]);
  } catch (error) {
    console.error('Create failed:', error);
  }
};

// MODALS
<CategoryPickerModal
  isOpen={showCategoryPicker}
  onClose={() => setShowCategoryPicker(false)}
  categories={getAvailableCategories().map(f => ({
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    _count: { documents: getDocumentCountByFolder(f.id) }
  }))}
  onMove={handleMoveToCategory}
  onCreateNew={() => setShowCreateCategory(true)}
  selectedCount={1}
  entityType="document"
/>

<CreateCategoryModalSimple
  isOpen={showCreateCategory}
  onClose={() => setShowCreateCategory(false)}
  onCreate={handleCreateCategory}
/>

// ============================================================================
// UPLOADMODAL.JSX & UPLOADHUB.JSX - Post-Upload Category Assignment
// ============================================================================

// IMPORTS (same as above)
// STATE
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [uploadedDocumentIds, setUploadedDocumentIds] = useState([]);
const [showCreateCategory, setShowCreateCategory] = useState(false);

// After successful upload, store document IDs
const handleUploadComplete = (documentIds) => {
  setUploadedDocumentIds(documentIds);
  setShowCategoryPicker(true); // Optionally auto-open
};

// HANDLERS
const handleMoveToCategory = async (categoryId) => {
  setShowCategoryPicker(false);
  try {
    await moveDocumentsToCategory(uploadedDocumentIds, categoryId);
  } catch (error) {
    console.error('Move failed:', error);
  }
  setUploadedDocumentIds([]);
};

const handleCreateCategory = async (name, emoji) => {
  setShowCreateCategory(false);
  setShowCategoryPicker(false);
  try {
    await createCategoryAndMove(name, emoji, uploadedDocumentIds);
  } catch (error) {
    console.error('Create failed:', error);
  }
  setUploadedDocumentIds([]);
};

// MODALS (same pattern as above)

// ============================================================================
// CLEANUP: FILES TO DELETE
// ============================================================================
/*
After verifying all pages work with the new universal modals, DELETE these files:

1. frontend/src/components/MoveToCategoryModal.jsx
2. frontend/src/components/MoveToFolderModal.jsx
3. frontend/src/components/AddToCategoryModal.jsx
4. frontend/src/components/UniversalAddToCategoryModal.jsx

DO NOT delete CreateCategoryModal.jsx if it's still used for full document selection.
The new CreateCategoryModalSimple is for the simplified flow (name + emoji only).
*/

// ============================================================================
// TRANSLATION KEYS - Add to your en.json / translation files
// ============================================================================
/*
{
  "modals": {
    "categoryPicker": {
      "title": "Move to Category",
      "file": "file",
      "files": "files",
      "createNew": "Create New Category",
      "move": "Move",
      "noCategories": "No categories available. Create one to get started!",
      "movingDocument": "Moving 1 document",
      "movingFolder": "Moving folder",
      "movingItems": "Moving {{count}} items"
    },
    "createCategory": {
      "title": "Create New Category",
      "categoryName": "Category Name",
      "categoryNamePlaceholder": "Enter category name...",
      "selectEmoji": "Select Icon",
      "nameRequired": "Category name is required",
      "showMoreEmojis": "Show More Icons"
    }
  },
  "toasts": {
    "fileMovedSuccessfully": "File moved successfully",
    "filesMovedSuccessfully": "{{count}} files moved successfully",
    "folderMovedSuccessfully": "Folder moved successfully",
    "failedToMoveFolder": "Failed to move folder",
    "categoryCreatedSuccessfully": "Category created successfully",
    "categoryCreatedAndFileAdded": "Category created and file added",
    "categoryCreatedAndFilesAdded": "Category created and {{count}} files added",
    "failedToCreateCategory": "Failed to create category",
    "failedToAddDocumentsToCategory": "Failed to move documents"
  },
  "common": {
    "creating": "Creating...",
    "create": "Create",
    "addToCategory": "Add to Category"
  },
  "bulkActions": {
    "moveToCategory": "Move to Category"
  }
}
*/
