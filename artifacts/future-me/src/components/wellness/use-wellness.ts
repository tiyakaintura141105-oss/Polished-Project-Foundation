import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListWellnessEntriesQueryKey,
  useDeleteWellnessEntry,
  useListWellnessEntries,
  useUpsertWellnessEntry,
} from '@workspace/api-client-react';
import type { WellnessEntryInput } from '@workspace/api-client-react';

export function useWellness() {
  const client = useQueryClient();
  const query = useListWellnessEntries(undefined, {
    query: { queryKey: getListWellnessEntriesQueryKey() },
  });
  const upsert = useUpsertWellnessEntry();
  const remove = useDeleteWellnessEntry();
  const [message, setMessage] = useState('');
  const [mutationError, setMutationError] = useState('');

  const save = (data: WellnessEntryInput, successMessage = 'Saved to your personal record.') => {
    setMessage('');
    setMutationError('');
    upsert.mutate({ data }, {
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: getListWellnessEntriesQueryKey() });
        setMessage(successMessage);
      },
      onError: () => setMutationError('We couldn’t save that just now. Your details are still here; please try again.'),
    });
  };

  const deleteEntry = (entryKey: string) => {
    setMessage('');
    setMutationError('');
    remove.mutate({ entryKey }, {
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: getListWellnessEntriesQueryKey() });
        setMessage('That entry has been removed.');
      },
      onError: () => setMutationError('We couldn’t remove that entry. Please try again.'),
    });
  };

  return {
    entries: query.data?.entries ?? [],
    query,
    isSaving: upsert.isPending || remove.isPending,
    message,
    mutationError,
    save,
    deleteEntry,
  };
}