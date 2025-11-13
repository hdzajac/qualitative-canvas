import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';

type OptimisticUpdateFn<TData, TVariables> = (
  oldData: TData | undefined,
  variables: TVariables
) => TData;

interface UseOptimisticMutationOptions<TData, TError, TVariables, TContext>
  extends Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'onMutate' | 'onError' | 'onSettled'> {
  queryKey: unknown[];
  optimisticUpdate?: OptimisticUpdateFn<TData, TVariables>;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
}

/**
 * Custom hook that wraps useMutation with built-in optimistic updates and rollback
 * 
 * @example
 * ```typescript
 * const updateMutation = useOptimisticMutation({
 *   queryKey: ['items'],
 *   mutationFn: (item: Item) => updateItem(item.id, item),
 *   optimisticUpdate: (oldData, variables) => {
 *     return oldData?.map(item => 
 *       item.id === variables.id ? variables : item
 *     ) ?? [];
 *   },
 * });
 * ```
 */
export function useOptimisticMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: UseOptimisticMutationOptions<TData, TError, TVariables, TContext>
) {
  const queryClient = useQueryClient();
  const { queryKey, optimisticUpdate, onSuccess, onError, onSettled, ...mutationOptions } = options;

  return useMutation<TData, TError, TVariables, TContext & { previousData?: TData }>({
    ...mutationOptions,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<TData>(queryKey);

      // Optimistically update to the new value if updater provided
      if (optimisticUpdate && previousData !== undefined) {
        const newData = optimisticUpdate(previousData, variables);
        queryClient.setQueryData<TData>(queryKey, newData);
      }

      // Return context with previous data for rollback
      return { previousData } as TContext & { previousData?: TData };
    },
    onError: (error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData !== undefined) {
        queryClient.setQueryData<TData>(queryKey, context.previousData);
      }

      // Call custom error handler
      onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      // Call custom success handler
      onSuccess?.(data, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      // Always refetch after mutation settles (success or error)
      queryClient.invalidateQueries({ queryKey });

      // Call custom settled handler
      onSettled?.(data, error ?? null, variables, context);
    },
  });
}
