/**
 * Export Routes
 * Handles project export endpoints
 */

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import archiver from 'archiver';
import exportService from '../services/exportService.js';

/**
 * Generate README for export archive
 */
function generateExportReadme(projectName, timestamp) {
  return `Project Export: ${projectName}
Generated: ${timestamp}

This archive contains your qualitative analysis project in CSV format.

Files included:
- project.csv: Project metadata
- files.csv: Document content
- codes.csv: Highlighted text segments with positions
- themes.csv: Code groupings
- insights.csv: Theme groupings
- annotations.csv: Canvas sticky notes
- media.csv: Audio/video file metadata (if applicable)
- segments.csv: Transcript segments (if applicable)
- participants.csv: Speaker information (if applicable)

CSV Structure:
- UTF-8 encoded with BOM for Excel compatibility
- Array fields (code_ids, theme_ids) use semicolon (;) as delimiter
- Position and size data flattened to individual columns
- All IDs preserved for potential reimport

Using the data:
- Open CSV files in Excel, Google Sheets, R, Python, SPSS, etc.
- To open in Excel: Use "Get Data" → "From Text/CSV" for proper UTF-8 handling
- Code relationships: themes.code_ids references codes.id
- Theme relationships: insights.theme_ids references themes.id

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

        archive.pipe(res);

        // Add UTF-8 BOM to each CSV for Excel compatibility
        const BOM = '\uFEFF';

        // Add each CSV to archive
        archive.append(BOM + csvData.project, { name: 'project.csv' });
        archive.append(BOM + csvData.files, { name: 'files.csv' });
        archive.append(BOM + csvData.codes, { name: 'codes.csv' });
        archive.append(BOM + csvData.themes, { name: 'themes.csv' });
        archive.append(BOM + csvData.insights, { name: 'insights.csv' });
        archive.append(BOM + csvData.annotations, { name: 'annotations.csv' });

        // Only add media-related CSVs if they have data
        if (csvData.media && csvData.media.split('\n').length > 1) {
          archive.append(BOM + csvData.media, { name: 'media.csv' });
        }
        if (csvData.segments && csvData.segments.split('\n').length > 1) {
          archive.append(BOM + csvData.segments, { name: 'segments.csv' });
        }
        if (csvData.participants && csvData.participants.split('\n').length > 1) {
          archive.append(BOM + csvData.participants, { name: 'participants.csv' });
        }

        // Add README
        const readmeContent = generateExportReadme(projectName, new Date().toISOString());
        archive.append(readmeContent, { name: 'README.txt' });

        // Finalize archive
        await archive.finalize();
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

  return router;
}
