/**
 * VTT (WebVTT) Utility Functions
 * Handles conversion of transcript segments to WebVTT format
 */

/**
 * Format milliseconds to WebVTT timestamp format (HH:MM:SS.mmm)
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} - Formatted timestamp (e.g., "00:01:30.500")
 */
export function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ms = milliseconds % 1000;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Generate WebVTT content from transcript segments
 * @param {Array} segments - Array of transcript segment objects
 * @param {Array} participants - Array of participant objects
 * @returns {string} - WebVTT formatted content
 */
export function generateVTT(segments, participants) {
  // Create participant lookup map
  const participantMap = new Map(
    participants.map(p => [p.id, p.name])
  );
  
  // Start with WebVTT header
  let vtt = 'WEBVTT\n\n';
  
  // Add each segment
  segments.forEach((segment, index) => {
    const speaker = segment.participant_id 
      ? participantMap.get(segment.participant_id) || 'Unknown Speaker'
      : 'Speaker';
    
    // Add cue identifier (optional but helpful for debugging)
    vtt += `${index + 1}\n`;
    
    // Add timestamp
    vtt += `${formatTime(segment.start_ms)} --> ${formatTime(segment.end_ms)}\n`;
    
    // Add text with voice tag for speaker identification
    vtt += `<v ${speaker}>${segment.text}</v>\n\n`;
  });
  
  return vtt;
}

/**
 * Generate plain VTT without speaker tags (for compatibility)
 * @param {Array} segments - Array of transcript segment objects
 * @param {Array} participants - Array of participant objects
 * @returns {string} - WebVTT formatted content
 */
export function generatePlainVTT(segments, participants) {
  const participantMap = new Map(
    participants.map(p => [p.id, p.name])
  );
  
  let vtt = 'WEBVTT\n\n';
  
  segments.forEach((segment, index) => {
    const speaker = segment.participant_id 
      ? participantMap.get(segment.participant_id)
      : null;
    
    vtt += `${index + 1}\n`;
    vtt += `${formatTime(segment.start_ms)} --> ${formatTime(segment.end_ms)}\n`;
    
    // Prepend speaker name to text for plain format
    const text = speaker ? `[${speaker}] ${segment.text}` : segment.text;
    vtt += `${text}\n\n`;
  });
  
  return vtt;
}
