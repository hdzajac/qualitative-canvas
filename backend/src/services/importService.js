/**
 * Import Service
 * Handles importing project data from CSV files with ID remapping
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Parse CSV content into rows
 */
function parseCSV(csvContent) {
  if (!csvContent || csvContent.trim() === '') {
    return [];
  }

  // Remove BOM if present
  let content = csvContent;
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  // Parse CSV properly handling multi-line fields
  const rows = [];
  const lines = [];
  let currentLine = '';
  let inQuotes = false;

  // Split into logical lines (not just \n, because fields can contain newlines)
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    currentLine += char;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += nextChar;
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not inside quotes)
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
    }
  }
  // Don't forget the last line if it doesn't end with newline
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  if (lines.length < 2) return []; // Need at least header + 1 row

  const headers = parseCSVLine(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse JSONB field from CSV (position, etc.)
 */
function parseJSONBField(value) {
  if (!value || value === 'null' || value === '') return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

/**
 * Parse array field (semicolon-separated)
 */
function parseArrayField(value) {
  if (!value || value === '') return [];
  return value.split(';').map(v => v.trim()).filter(v => v);
}

/**
 * Reconstruct position JSONB from flattened CSV columns
 */
function reconstructPosition(row) {
  const x = parseFloat(row.position_x);
  const y = parseFloat(row.position_y);
  
  if (!isNaN(x) && !isNaN(y)) {
    return { x, y };
  }
  return null;
}

export default function importService(pool) {
  /**
   * Import a complete project from CSV files
   * @param {Object} csvFiles - Object containing CSV content for each entity
   * @returns {Promise<Object>} - Import result with new project ID
   */
  async function importProjectFromCSV(csvFiles) {
    const idMap = {}; // Maps old UUIDs to new UUIDs

    // Helper to get or create new ID
    const getNewId = (oldId) => {
      if (!oldId) return null;
      if (!idMap[oldId]) {
        idMap[oldId] = uuidv4();
      }
      return idMap[oldId];
    };

    // Helper to map array of old IDs to new IDs
    const mapIdArray = (oldIds) => {
      if (!oldIds || oldIds.length === 0) return [];
      return oldIds.map(oldId => getNewId(oldId)).filter(id => id);
    };

    try {
      await pool.query('BEGIN');

      // 1. Import project
      const projectRows = parseCSV(csvFiles.project);
      if (projectRows.length === 0) {
        throw new Error('No project data found');
      }

      const projectRow = projectRows[0];
      const newProjectId = getNewId(projectRow.id);

      await pool.query(
        'INSERT INTO projects (id, name, description, created_at) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))',
        [newProjectId, projectRow.name, projectRow.description || null, projectRow.created_at || null]
      );

      // 2. Import files (documents)
      const fileRows = parseCSV(csvFiles.files);
      for (const row of fileRows) {
        // Skip files without filename (database constraint)
        if (!row.filename || row.filename.trim() === '') {
          console.warn(`Skipping file with empty filename: ${row.id}`);
          continue;
        }

        const newFileId = getNewId(row.id);
        await pool.query(
          'INSERT INTO files (id, project_id, filename, content, created_at) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))',
          [newFileId, newProjectId, row.filename.trim(), row.content || '', row.created_at || null]
        );
      }

      // 3. Import media files
      const mediaRows = parseCSV(csvFiles.media || '');
      for (const row of mediaRows) {
        const newMediaId = getNewId(row.id);
        await pool.query(
          `INSERT INTO media_files (id, project_id, original_filename, mime_type, size_bytes, status, duration_sec, storage_path, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
          [
            newMediaId,
            newProjectId,
            row.original_filename,
            row.mime_type,
            row.size_bytes ? parseInt(row.size_bytes) : null,
            row.status || 'uploaded',
            row.duration_sec ? parseInt(row.duration_sec) : null,
            row.storage_path,
            row.created_at || null
          ]
        );
      }

      // 4. Import participants
      const participantRows = parseCSV(csvFiles.participants || '');
      for (const row of participantRows) {
        const newParticipantId = getNewId(row.id);
        const newMediaId = getNewId(row.media_file_id);
        
        if (newMediaId) {
          await pool.query(
            'INSERT INTO participants (id, media_file_id, name, color) VALUES ($1, $2, $3, $4)',
            [newParticipantId, newMediaId, row.name, row.color]
          );
        }
      }

      // 5. Import transcript segments
      const segmentRows = parseCSV(csvFiles.segments || '');
      for (const row of segmentRows) {
        const newSegmentId = getNewId(row.id);
        const newMediaId = getNewId(row.media_file_id);
        const newParticipantId = getNewId(row.participant_id);
        
        if (newMediaId) {
          await pool.query(
            `INSERT INTO transcript_segments (id, media_file_id, participant_id, idx, start_ms, end_ms, text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))`,
            [
              newSegmentId,
              newMediaId,
              newParticipantId,
              parseInt(row.idx),
              parseInt(row.start_ms),
              parseInt(row.end_ms),
              row.text,
              row.created_at || null
            ]
          );
        }
      }

      // 6. Import file_entries (unified abstraction for documents and media)
      // First create entries for imported files
      for (const row of fileRows) {
        const newFileId = getNewId(row.id);
        const newEntryId = uuidv4();
        
        await pool.query(
          'INSERT INTO file_entries (id, project_id, document_file_id, name, type, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))',
          [newEntryId, newProjectId, newFileId, row.filename, 'document', row.created_at || null]
        );
        
        // Map the file entry for codes reference
        idMap[`file_entry_${row.id}`] = newEntryId;
      }

      // Create entries for imported media as transcripts
      for (const row of mediaRows) {
        const newMediaId = getNewId(row.id);
        const newEntryId = uuidv4();
        
        await pool.query(
          'INSERT INTO file_entries (id, project_id, media_file_id, name, type, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))',
          [newEntryId, newProjectId, newMediaId, row.original_filename, 'transcript', row.created_at || null]
        );
        
        // Map the file entry for codes reference
        idMap[`file_entry_media_${row.id}`] = newEntryId;
      }

      // 7. Import codes
      const codeRows = parseCSV(csvFiles.codes);
      for (const row of codeRows) {
        const newCodeId = getNewId(row.id);
        const newFileId = getNewId(row.file_id);
        // Get the file_entry_id for this file
        const newFileEntryId = idMap[`file_entry_${row.file_id}`];
        
        if (newFileId && newFileEntryId) {
          const position = reconstructPosition(row);
          
          await pool.query(
            `INSERT INTO codes (id, file_id, file_entry_id, code_name, text, start_offset, end_offset, position, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
            [
              newCodeId,
              newFileId,
              newFileEntryId,
              row.code_name,
              row.text,
              row.start_offset ? parseInt(row.start_offset) : null,
              row.end_offset ? parseInt(row.end_offset) : null,
              position,
              row.created_at || null
            ]
          );
        }
      }

      // 8. Import themes (with code_ids array mapping)
      const themeRows = parseCSV(csvFiles.themes);
      for (const row of themeRows) {
        const newThemeId = getNewId(row.id);
        const oldCodeIds = parseArrayField(row.code_ids);
        const newCodeIds = mapIdArray(oldCodeIds);
        const position = reconstructPosition(row);
        
        await pool.query(
          `INSERT INTO themes (id, project_id, name, code_ids, position, created_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
          [
            newThemeId,
            newProjectId,
            row.name,
            newCodeIds,
            position,
            row.created_at || null
          ]
        );
      }

      // 9. Import insights (with theme_ids array mapping)
      const insightRows = parseCSV(csvFiles.insights);
      for (const row of insightRows) {
        const newInsightId = getNewId(row.id);
        const oldThemeIds = parseArrayField(row.theme_ids);
        const newThemeIds = mapIdArray(oldThemeIds);
        const position = reconstructPosition(row);
        
        await pool.query(
          `INSERT INTO insights (id, project_id, name, theme_ids, position, expanded, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
          [
            newInsightId,
            newProjectId,
            row.name,
            newThemeIds,
            position,
            row.expanded === 'true' || row.expanded === '1',
            row.created_at || null
          ]
        );
      }

      // 10. Import annotations
      const annotationRows = parseCSV(csvFiles.annotations || '');
      for (const row of annotationRows) {
        const newAnnotationId = getNewId(row.id);
        const position = reconstructPosition(row);
        
        await pool.query(
          'INSERT INTO annotations (id, project_id, content, position, created_at) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))',
          [newAnnotationId, newProjectId, row.content, position, row.created_at || null]
        );
      }

      await pool.query('COMMIT');

      return {
        success: true,
        projectId: newProjectId,
        stats: {
          files: fileRows.length,
          codes: codeRows.length,
          themes: themeRows.length,
          insights: insightRows.length,
          media: mediaRows.length,
          segments: segmentRows.length,
          participants: participantRows.length,
          annotations: annotationRows.length
        }
      };

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  return {
    importProjectFromCSV,
    parseCSV // Export for testing
  };
}
