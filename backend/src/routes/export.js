/**
 * Export Routes
 * Handles project export endpoints
 */

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import archiver from 'archiver';
import exportService from '../services/exportService.js';
import { generateVTT, generatePlainVTT } from '../utils/vttUtils.js';

/**
 * Generate README for export archive
 */
function generateExportReadme(projectName, timestamp) {
  return `Project Export: ${projectName}
Generated: ${timestamp}

This archive contains your complete qualitative analysis project, ready for analysis or reimport.

STRUCTURE:
==========

data/
  - project.csv: Project metadata
  - files.csv: Document content
  - codes.csv: Highlighted text segments with positions
  - themes.csv: Code groupings
  - insights.csv: Theme groupings
  - annotations.csv: Canvas sticky notes
  - media.csv: Audio/video file metadata (if applicable)
  - segments.csv: Transcript segments (if applicable)
  - participants.csv: Speaker information (if applicable)

media/
  - Original audio/video files (if applicable)

documents/
  - Text documents uploaded to the project

transcripts/
  - *.vtt: WebVTT transcript files for each media file (if applicable)
    These can be used in video players, editors, and subtitle tools

README.txt: This file

CSV STRUCTURE:
=============
- UTF-8 encoded with BOM for Excel compatibility
- Array fields (code_ids, theme_ids) use semicolon (;) as delimiter
- Position data flattened to individual columns (position_x, position_y)
- All IDs preserved to maintain relationships

USING THE DATA:
==============
- Open CSV files in Excel, Google Sheets, R, Python, SPSS, etc.
- Excel users: Use "Get Data" → "From Text/CSV" for proper UTF-8 handling
- Code relationships: themes.code_ids references codes.id
- Theme relationships: insights.theme_ids references themes.id
- Media relationships: segments.media_file_id references media.id
- VTT files can be opened in any video player or subtitle editor

REIMPORTING:
===========
This export package is designed to be reimported back into the application.
Future versions will support uploading this ZIP file to recreate the project
with all relationships intact.

For more information, visit: https://github.com/hdzajac/qualitative-canvas
`;
}

export default function exportRoutes(pool) {
  const router = Router();
  const service = exportService(pool);

  /**
   * Export project as ZIP containing all CSV files
   * GET /api/export/projects/:id/export?format=zip
   */
  router.get('/projects/:id/export', asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const format = req.query.format || 'zip';

    // Validate project exists
    const projectResult = await pool.query(
      'SELECT name FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectName = projectResult.rows[0].name;

    try {
      // Generate CSV data
      const csvData = await service.exportProjectToCSV(projectId);
      
      const safeProjectName = projectName.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const timestamp = new Date().toISOString().split('T')[0];

      if (format === 'zip') {
        // Create ZIP archive
        const archive = archiver('zip', { zlib: { level: 9 } });

        res.attachment(`${safeProjectName}_export_${timestamp}.zip`);
        res.setHeader('Content-Type', 'application/zip');

        // Set up archive event handlers
        archive.on('error', (err) => {
          throw err;
        });

        archive.pipe(res);

        // Add UTF-8 BOM to each CSV for Excel compatibility
        const BOM = '\uFEFF';

        // Add each CSV to archive in data/ folder
        archive.append(BOM + csvData.project, { name: 'data/project.csv' });
        archive.append(BOM + csvData.files, { name: 'data/files.csv' });
        archive.append(BOM + csvData.codes, { name: 'data/codes.csv' });
        archive.append(BOM + csvData.themes, { name: 'data/themes.csv' });
        archive.append(BOM + csvData.insights, { name: 'data/insights.csv' });
        archive.append(BOM + csvData.annotations, { name: 'data/annotations.csv' });

        // Only add media-related CSVs if they have data
        const hasMedia = csvData.media && csvData.media.split('\n').length > 1;
        if (hasMedia) {
          archive.append(BOM + csvData.media, { name: 'data/media.csv' });
        }
        if (csvData.segments && csvData.segments.split('\n').length > 1) {
          archive.append(BOM + csvData.segments, { name: 'data/segments.csv' });
        }
        if (csvData.participants && csvData.participants.split('\n').length > 1) {
          archive.append(BOM + csvData.participants, { name: 'data/participants.csv' });
        }

        // Add media files (audio) and VTT transcripts
        if (hasMedia) {
          const mediaResult = await pool.query(
            'SELECT id, original_filename, storage_path, status FROM media_files WHERE project_id = $1',
            [projectId]
          );

          for (const media of mediaResult.rows) {
            // Add audio file if it exists
            if (media.storage_path) {
              try {
                const fs = await import('fs');
                if (fs.existsSync(media.storage_path)) {
                  archive.file(media.storage_path, { name: `media/${media.original_filename}` });
                }
              } catch (error) {
                console.error(`Failed to add audio file ${media.original_filename}:`, error);
              }
            }

            // Add VTT transcript if transcription is done
            if (media.status === 'done') {
              const segmentsResult = await pool.query(
                'SELECT id, media_file_id, participant_id, idx, start_ms, end_ms, text FROM transcript_segments WHERE media_file_id = $1 ORDER BY idx',
                [media.id]
              );

              if (segmentsResult.rows.length > 0) {
                // Get participants
                const participantsResult = await pool.query(
                  'SELECT id, name FROM participants WHERE media_file_id = $1',
                  [media.id]
                );

                // Generate VTT
                const vttContent = generateVTT(segmentsResult.rows, participantsResult.rows);
                const baseFilename = media.original_filename.replace(/\.[^/.]+$/, '');
                archive.append(vttContent, { name: `transcripts/${baseFilename}.vtt` });
              }
            }
          }
        }

        // Add document files
        const filesResult = await pool.query(
          'SELECT id, filename, content FROM files WHERE project_id = $1',
          [projectId]
        );

        for (const file of filesResult.rows) {
          if (file.content) {
            archive.append(file.content, { name: `documents/${file.filename}` });
          }
        }

        // Add README
        const readmeContent = generateExportReadme(projectName, new Date().toISOString());
        archive.append(readmeContent, { name: 'README.txt' });

        // Finalize archive and wait for it to finish
        await new Promise((resolve, reject) => {
          archive.on('end', resolve);
          archive.on('error', reject);
          archive.finalize();
        });
      } else if (format === 'csv') {
        // Single CSV export for specific entity
        const entity = req.query.entity || 'codes';
        const validEntities = ['project', 'files', 'codes', 'themes', 'insights', 'annotations', 'media', 'segments', 'participants'];
        
        if (!validEntities.includes(entity)) {
          return res.status(400).json({ error: 'Invalid entity type' });
        }

        res.attachment(`${safeProjectName}_${entity}_${timestamp}.csv`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send('\uFEFF' + csvData[entity]); // UTF-8 BOM
      } else {
        return res.status(400).json({ error: 'Invalid format. Use "zip" or "csv"' });
      }
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export project', details: error.message });
    }
  }));

  /**
   * Export transcript as VTT file
   * GET /api/export/media/:mediaId/transcript/vtt?format=tagged
   */
  router.get('/media/:mediaId/transcript/vtt', asyncHandler(async (req, res) => {
    const { mediaId } = req.params;
    const format = req.query.format || 'tagged'; // 'tagged' or 'plain'

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID format' });
    }

    try {
      // Get media file info
      const mediaResult = await pool.query(
        'SELECT original_filename FROM media_files WHERE id = $1',
        [mediaId]
      );
      
      if (mediaResult.rows.length === 0) {
        return res.status(404).json({ error: 'Media file not found' });
      }

      const originalName = mediaResult.rows[0].original_filename;

      // Get segments ordered by index
      const segmentsResult = await pool.query(
        'SELECT id, media_file_id, participant_id, idx, start_ms, end_ms, text FROM transcript_segments WHERE media_file_id = $1 ORDER BY idx',
        [mediaId]
      );

      if (segmentsResult.rows.length === 0) {
        return res.status(404).json({ error: 'No transcript found for this media file' });
      }

      // Get participants
      const participantsResult = await pool.query(
        'SELECT id, name FROM participants WHERE media_file_id = $1',
        [mediaId]
      );

      // Generate VTT content
      const vttContent = format === 'plain' 
        ? generatePlainVTT(segmentsResult.rows, participantsResult.rows)
        : generateVTT(segmentsResult.rows, participantsResult.rows);

      // Create filename
      const baseFilename = originalName.replace(/\.[^/.]+$/, '');
      const filename = `${baseFilename}.vtt`;

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(vttContent);
    } catch (error) {
      console.error('VTT export error:', error);
      res.status(500).json({ error: 'Failed to export transcript', details: error.message });
    }
  }));

  return router;
}
