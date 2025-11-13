import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLatestJobForMedia } from '@/services/api';
import type { TranscriptionJob } from '@/types';

/**
 * Custom hook to manage job polling for media transcription
 * Automatically polls when media status is 'processing'
 * 
 * @param mediaId - ID of the media file
 * @param mediaStatus - Current status of the media ('uploaded', 'processing', 'done', 'error')
 * @param pollInterval - Polling interval in milliseconds (default: 5000)
 * @returns Job data and polling status
 */
export function useJobPolling(
  mediaId: string | undefined,
  mediaStatus: string | undefined,
  pollInterval: number = 5000
) {
  const [shouldPoll, setShouldPoll] = useState(false);

  // Update polling status based on media status
  useEffect(() => {
    const isProcessing = mediaStatus === 'processing';
    setShouldPoll(isProcessing);
  }, [mediaStatus]);

  // Query for latest job with conditional polling
  const { data: job, isLoading, error } = useQuery<TranscriptionJob>({
    queryKey: ['latestJob', mediaId],
    queryFn: () => getLatestJobForMedia(mediaId!),
    enabled: !!mediaId && shouldPoll,
    refetchInterval: shouldPoll ? pollInterval : false,
    staleTime: 0, // Always consider stale during polling
  });

  // Stop polling if job status indicates completion or error
  useEffect(() => {
    if (job?.status === 'done' || job?.status === 'error') {
      setShouldPoll(false);
    }
  }, [job?.status]);

  return {
    job,
    isPolling: shouldPoll,
    isLoading,
    error,
  };
}
