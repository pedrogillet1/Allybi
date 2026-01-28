import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEYS - Centralized for consistency
// ═══════════════════════════════════════════════════════════════════════════
export const foldersKeys = {
  all: ['folders'],
  lists: () => [...foldersKeys.all, 'list'],
  list: (filters) => [...foldersKeys.lists(), { filters }],
  details: () => [...foldersKeys.all, 'detail'],
  detail: (id) => [...foldersKeys.details(), id],
  tree: () => [...foldersKeys.all, 'tree'],
};

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL FOLDERS - List view
// ═══════════════════════════════════════════════════════════════════════════
export function useFolders(filters = {}) {
  return useQuery({
    queryKey: foldersKeys.list(filters),
    queryFn: async () => {

      const response = await api.get('/api/folders', { params: filters });

      return response.data;
    },
    // Cache for 5 minutes (folders don't change often)
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    keepPreviousData: true,
    onError: (error) => {

    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET SINGLE FOLDER - Detail view
// ═══════════════════════════════════════════════════════════════════════════
export function useFolder(folderId) {
  return useQuery({
    queryKey: foldersKeys.detail(folderId),
    queryFn: async () => {
      if (!folderId) {
        throw new Error('Folder ID is required');
      }

      const response = await api.get(`/api/folders/${folderId}`);

      return response.data;
    },
    enabled: !!folderId,
    staleTime: 5 * 60 * 1000,
    onError: (error) => {

    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET FOLDER TREE - Hierarchical structure
// ═══════════════════════════════════════════════════════════════════════════
export function useFolderTree() {
  return useQuery({
    queryKey: foldersKeys.tree(),
    queryFn: async () => {

      const response = await api.get('/api/folders/tree');

      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    onError: (error) => {

    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE FOLDER - Mutation with optimistic update
// ═══════════════════════════════════════════════════════════════════════════
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderData) => {

      const response = await api.post('/api/folders', folderData);
      return response.data;
    },

    // Optimistic update - add folder immediately
    onMutate: async (folderData) => {
      await queryClient.cancelQueries({ queryKey: foldersKeys.lists() });

      const previousFolders = queryClient.getQueryData(foldersKeys.lists());

      // Create optimistic folder
      const optimisticFolder = {
        id: `temp-${Date.now()}`,
        name: folderData.name,
        emoji: folderData.emoji || null,
        parentFolderId: folderData.parentFolderId || null,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      };

      // Add to list
      queryClient.setQueryData(foldersKeys.lists(), (old) => ({
        ...old,
        items: [optimisticFolder, ...(old?.items || old?.folders || [])],
      }));

      return { previousFolders };
    },

    onError: (err, folderData, context) => {

      if (context?.previousFolders) {
        queryClient.setQueryData(foldersKeys.lists(), context.previousFolders);
      }
    },

    onSuccess: (data) => {

      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: foldersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: foldersKeys.tree() });

      // Set the new folder data
      queryClient.setQueryData(foldersKeys.detail(data.id), data);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE FOLDER - Mutation with optimistic update
// ═══════════════════════════════════════════════════════════════════════════
export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, updates }) => {

      const response = await api.patch(`/api/folders/${folderId}`, updates);
      return response.data;
    },

    // Optimistic update
    onMutate: async ({ folderId, updates }) => {
      await queryClient.cancelQueries({ queryKey: foldersKeys.detail(folderId) });
      await queryClient.cancelQueries({ queryKey: foldersKeys.lists() });

      const previousFolder = queryClient.getQueryData(foldersKeys.detail(folderId));
      const previousList = queryClient.getQueryData(foldersKeys.lists());

      // Update in detail view
      queryClient.setQueryData(foldersKeys.detail(folderId), (old) => ({
        ...old,
        ...updates,
      }));

      // Update in list view
      queryClient.setQueryData(foldersKeys.lists(), (old) => ({
        ...old,
        items: (old?.items || old?.folders || []).map(folder =>
          folder.id === folderId ? { ...folder, ...updates } : folder
        ),
      }));

      return { previousFolder, previousList };
    },

    onError: (err, { folderId }, context) => {

      if (context?.previousFolder) {
        queryClient.setQueryData(foldersKeys.detail(folderId), context.previousFolder);
      }
      if (context?.previousList) {
        queryClient.setQueryData(foldersKeys.lists(), context.previousList);
      }
    },

    onSuccess: (data, { folderId }) => {

      queryClient.invalidateQueries({ queryKey: foldersKeys.detail(folderId) });
      queryClient.invalidateQueries({ queryKey: foldersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: foldersKeys.tree() });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE FOLDER - Mutation with optimistic update
// ═══════════════════════════════════════════════════════════════════════════
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId) => {

      const response = await api.delete(`/api/folders/${folderId}`);
      return response.data;
    },

    // Optimistic update - remove folder immediately
    onMutate: async (folderId) => {
      await queryClient.cancelQueries({ queryKey: foldersKeys.lists() });

      const previousFolders = queryClient.getQueryData(foldersKeys.lists());

      // Remove from list
      queryClient.setQueryData(foldersKeys.lists(), (old) => ({
        ...old,
        items: (old?.items || old?.folders || []).filter(folder => folder.id !== folderId),
      }));

      return { previousFolders };
    },

    onError: (err, folderId, context) => {

      if (context?.previousFolders) {
        queryClient.setQueryData(foldersKeys.lists(), context.previousFolders);
      }
    },

    onSuccess: (data, folderId) => {

      // Remove from cache
      queryClient.removeQueries({ queryKey: foldersKeys.detail(folderId) });

      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: foldersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: foldersKeys.tree() });
    },
  });
}
