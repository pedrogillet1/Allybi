# Universal Category Picker Modal - Refactoring Guide

## Summary

This refactoring standardizes all category/move modal implementations across the app into one universal solution. All pages now use:
- **CategoryPickerModal** - Single modal for category selection
- **CreateCategoryModalSimple** - Streamlined category creation
- **useCategoryMove** - Unified move logic hook

## Files Created

### 1. Core Components
- `frontend/src/components/CategoryPickerModal.jsx` - Universal category picker (NEW)
- `frontend/src/components/CreateCategoryModalSimple.jsx` - Simplified category creator (NEW)
- `frontend/src/hooks/useCategoryMove.js` - Unified move operations hook (NEW)

### 2. Files to Modify
- `frontend/src/components/Documents.jsx`
- `frontend/src/components/DocumentsPage.jsx`
- `frontend/src/components/FileTypeDetail.jsx`
- `frontend/src/components/CategoryDetail.jsx`
- `frontend/src/components/DocumentViewer.jsx`
- `frontend/src/components/UploadModal.jsx`
- `frontend/src/components/UploadHub.jsx`

### 3. Files to DELETE (after refactoring)
- `frontend/src/components/MoveToFolderModal.jsx` - Unused alternate implementation
- `frontend/src/components/AddToCategoryModal.jsx` - Legacy full-width modal
- `frontend/src/components/UniversalAddToCategoryModal.jsx` - Duplicate implementation
- `frontend/src/components/MoveToCategoryModal.jsx` - Replaced by CategoryPickerModal

## Detailed Changes for Documents.jsx

### Step 1: Update Imports

**REMOVE these imports:**
```javascript
import MoveToCategoryModal from './MoveToCategoryModal';
import CreateCategoryModal from './CreateCategoryModal';
```

**ADD these imports:**
```javascript
import CategoryPickerModal from './CategoryPickerModal';
import CreateCategoryModalSimple from './CreateCategoryModalSimple';
import { useCategoryMove } from '../hooks/useCategoryMove';
```

### Step 2: Update State (lines ~104-123)

**REMOVE:**
```javascript
const [showCategoryModal, setShowCategoryModal] = useState(false);
const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
const [selectedCategoryId, setSelectedCategoryId] = useState(null);
const [showCreateFromMoveModal, setShowCreateFromMoveModal] = useState(false);
```

**REPLACE WITH:**
```javascript
// Universal category picker state
const [showCategoryPicker, setShowCategoryPicker] = useState(false);
const [categoryPickerContext, setCategoryPickerContext] = useState({
  documentIds: [],
  entityType: 'document',
  isSelectMode: false
});
const [showCreateCategory, setShowCreateCategory] = useState(false);
```

### Step 3: Add Move Hook (after other hooks ~line 84)

**ADD:**
```javascript
// Universal move operations
const {
  moveDocumentsToCategory,
  createCategoryAndMove,
  getAvailableCategories
} = useCategoryMove();
```

### Step 4: Replace Handler Functions (lines ~382-458)

**REMOVE the entire section with:**
- `handleAddToCategory`
- `handleCategorySelection`
- `handleCreateCategoryFromMove`

**REPLACE WITH:**
```javascript
// Universal handler: Open category picker
const handleOpenCategoryPicker = (doc = null) => {
  const docsToMove = isSelectMode
    ? Array.from(selectedDocuments)
    : (doc ? [doc.id] : []);

  if (docsToMove.length === 0) return;

  setCategoryPickerContext({
    documentIds: docsToMove,
    entityType: docsToMove.length > 1 ? 'documents' : 'document',
    isSelectMode: isSelectMode
  });

  setShowCategoryPicker(true);
  setOpenDropdownId(null);
};

// Universal handler: Move to category
const handleMoveToCategory = async (categoryId) => {
  // Close modal immediately
  setShowCategoryPicker(false);

  const { documentIds, isSelectMode: wasSelectMode } = categoryPickerContext;

  try {
    // Use universal move function (handles toasts and UI updates)
    await moveDocumentsToCategory(documentIds, categoryId);

    // Clear selection if in select mode
    if (wasSelectMode) {
      clearSelection();
      toggleSelectMode();
    }
  } catch (error) {
    // Error already handled by useCategoryMove hook
    console.error('Move error:', error);
  }

  // Reset context
  setCategoryPickerContext({
    documentIds: [],
    entityType: 'document',
    isSelectMode: false
  });
};

// Universal handler: Create category and move
const handleCreateCategory = async (name, emoji) => {
  const { documentIds, isSelectMode: wasSelectMode } = categoryPickerContext;

  // Close modals immediately
  setShowCreateCategory(false);
  setShowCategoryPicker(false);

  try {
    // Create category and move documents (handles toasts)
    await createCategoryAndMove(name, emoji, documentIds);

    // Clear selection if in select mode
    if (wasSelectMode) {
      clearSelection();
      toggleSelectMode();
    }
  } catch (error) {
    // Error already handled by useCategoryMove hook
    console.error('Create category error:', error);
  }

  // Reset context
  setCategoryPickerContext({
    documentIds: [],
    entityType: 'document',
    isSelectMode: false
  });
};
```

### Step 5: Update Document Action Button (line ~2124)

**CHANGE:**
```javascript
onClick={(e) => {
  e.stopPropagation();
  handleAddToCategory(doc);
}}
```

**TO:**
```javascript
onClick={(e) => {
  e.stopPropagation();
  handleOpenCategoryPicker(doc);
}}
```

### Step 6: Update Bulk Actions (if exists in select mode bar)

**FIND any buttons/actions that trigger bulk category moves and update to:**
```javascript
onClick={() => handleOpenCategoryPicker()}
```

### Step 7: Replace Modal Components (lines ~2267-2307)

**REMOVE:**
```jsx
{/* Create Category From Move Modal */}
<CreateCategoryModal
  isOpen={showCreateFromMoveModal}
  onClose={() => setShowCreateFromMoveModal(false)}
  onCreateCategory={handleCreateCategoryFromMove}
  uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
/>

{/* Add to Category Modal */}
<MoveToCategoryModal
  isOpen={showCategoryModal}
  onClose={() => {
    setShowCategoryModal(false);
    setSelectedDocumentForCategory(null);
    setSelectedCategoryId(null);
  }}
  selectedDocument={selectedDocumentForCategory}
  categories={getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added').map(f => ({
    ...f,
    fileCount: getDocumentCountByFolder(f.id)
  }))}
  selectedCategoryId={selectedCategoryId}
  onCategorySelect={setSelectedCategoryId}
  onCreateNew={() => {
    setShowCategoryModal(false);
    setShowCreateFromMoveModal(true);
  }}
  onConfirm={handleCategorySelection}
/>
```

**REPLACE WITH:**
```jsx
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
    ...f,
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
```

### Step 8: Update CreateCategoryModal (for regular category creation - line ~2267)

**IF there's a regular CreateCategoryModal** (not from move flow), you can keep it as is OR replace with CreateCategoryModalSimple depending on whether you need document selection.

**For simple creation (no document selection):**
```jsx
<CreateCategoryModalSimple
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  onCreate={async (name, emoji) => {
    await createFolder(name, emoji, null);
    showSuccess(t('toasts.categoryCreatedSuccessfully'));
    setIsModalOpen(false);
  }}
/>
```

## Similar Changes for Other Pages

### DocumentsPage.jsx
Apply the same pattern as Documents.jsx (nearly identical implementation).

### FileTypeDetail.jsx
1. Import CategoryPickerModal, CreateCategoryModalSimple, useCategoryMove
2. Replace any move/category modals with universal versions
3. Update handlers to use `handleOpenCategoryPicker`

### CategoryDetail.jsx
**Key difference:** May need to handle folder moves in addition to documents.

```javascript
const handleMoveFolderToCategory = async (categoryId) => {
  setShowCategoryPicker(false);

  try {
    await moveFolderToCategory(currentFolderId, categoryId);
    navigate('/documents'); // or refresh
  } catch (error) {
    console.error('Move folder error:', error);
  }
};
```

### DocumentViewer.jsx
Apply same pattern - single document context.

### UploadModal.jsx & UploadHub.jsx
1. Remove any custom inline modals
2. Use CategoryPickerModal for post-upload category assignment
3. Simplify selection logic - let the universal modal handle it

## Translation Keys Needed

Add these to your i18n translation files:

```json
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
    "create": "Create"
  }
}
```

## Testing Checklist

After refactoring each page:

- [ ] Single document move works
- [ ] Bulk document move works (select mode)
- [ ] "Create New Category" button opens creation modal
- [ ] After creating category, it appears in the list
- [ ] Category selection shows checkmark and border
- [ ] "Move" button is disabled until selection
- [ ] Esc key closes modal
- [ ] Click outside closes modal
- [ ] Success toast shows after move
- [ ] UI updates immediately (optimistic)
- [ ] Select mode clears after bulk move
- [ ] "Recently added" folder is excluded
- [ ] Error handling shows appropriate messages
- [ ] Mobile responsive (tested on mobile viewport)

## Edge Cases Handled

1. **Empty selection:** Handlers check for empty documentIds array
2. **System folders:** `getAvailableCategories()` filters out "recently added"
3. **Concurrent operations:** Uses Promise.all for bulk moves
4. **Optimistic updates:** UI updates immediately via DocumentsContext
5. **Error rollback:** DocumentsContext handles rollback on error
6. **Select mode cleanup:** Clears selection and exits select mode after move
7. **Modal state cleanup:** Resets context state on close
8. **Esc key:** Both modals handle Esc key press
9. **Click outside:** Both modals close on backdrop click
10. **Disabled state:** Create button disabled until name entered, Move disabled until selection

## Migration Strategy

1. ✅ Create new universal components (CategoryPickerModal, CreateCategoryModalSimple, useCategoryMove)
2. ⏳ Refactor Documents.jsx (primary page)
3. ⏳ Refactor DocumentsPage.jsx (secondary page)
4. ⏳ Refactor FileTypeDetail.jsx
5. ⏳ Refactor CategoryDetail.jsx
6. ⏳ Refactor DocumentViewer.jsx
7. ⏳ Refactor UploadModal.jsx and UploadHub.jsx
8. ⏳ Test all pages thoroughly
9. ⏳ Delete old modal implementations
10. ⏳ Remove unused imports from all files

## Benefits

- **Single source of truth:** One modal implementation for all pages
- **Consistent UX:** Same behavior everywhere
- **Consistent move logic:** One hook handles all moves
- **Easier maintenance:** Fix once, works everywhere
- **Better testing:** Test one component instead of many
- **Cleaner code:** Less duplication
- **Standardized naming:** "Category" for root, "Folder" for subfolders
- **Improved error handling:** Centralized in hook
- **Optimistic updates:** Instant UI feedback
- **Mobile friendly:** Responsive design everywhere
