const STORAGE_KEY = 'koda_category_documents';

// Get all categories from localStorage
export const getCategories = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored || stored === 'undefined') {
    const defaultCategories = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCategories));
    return defaultCategories;
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.warn('⚠️ Failed to parse categories from localStorage:', e);
    const defaultCategories = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultCategories));
    return defaultCategories;
  }
};

// Get a specific category by ID
export const getCategory = (categoryId) => {
  const categories = getCategories();
  return categories.find(cat => cat.id === categoryId);
};

// Add a document to a category
export const addDocumentToCategory = (categoryId, documentId) => {
  const categories = getCategories();
  const category = categories.find(cat => cat.id === categoryId);

  if (category && !category.documentIds.includes(documentId)) {
    category.documentIds.push(documentId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  }
};

// Remove a document from a category
export const removeDocumentFromCategory = (categoryId, documentId) => {
  const categories = getCategories();
  const category = categories.find(cat => cat.id === categoryId);

  if (category) {
    category.documentIds = category.documentIds.filter(id => id !== documentId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  }
};

// Get documents for a specific category
export const getCategoryDocuments = (categoryId, allDocuments) => {
  const category = getCategory(categoryId);
  if (!category) return [];

  return allDocuments.filter(doc => category.documentIds.includes(doc.id));
};

// Get document count for a category
export const getCategoryDocumentCount = (categoryId) => {
  const category = getCategory(categoryId);
  return category ? category.documentIds.length : 0;
};

// Create a new category
export const createCategory = (name, emoji) => {
  const categories = getCategories();
  const newCategory = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    emoji,
    documentIds: []
  };
  categories.push(newCategory);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  return newCategory;
};

// Get categories with document counts
export const getCategoriesWithCounts = () => {
  const categories = getCategories();
  return categories.map(cat => ({
    ...cat,
    files: cat.documentIds.length
  }));
};

// Delete a category
export const deleteCategory = (categoryId) => {
  const categories = getCategories();
  const filtered = categories.filter(cat => cat.id !== categoryId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};
