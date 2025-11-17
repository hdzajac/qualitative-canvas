/**
 * Import Routes
 * API endpoints for importing project data
 */

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import multer from 'multer';
import AdmZip from 'adm-zip';
import importService from '../services/importService.js';

// Configure multer for in-memory file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

export default function importRoutes(pool) {
  const router = Router();
  const service = importService(pool);

  /**
   * Import a project from exported ZIP file
   * POST /api/import/projects
   */
  router.post('/projects', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      // Parse ZIP file
      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();

      // Extract CSV files from data/ folder
      const csvFiles = {};
      const requiredFiles = ['project', 'files', 'codes', 'themes', 'insights'];
      const optionalFiles = ['annotations', 'media', 'segments', 'participants'];

      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('data/') && entry.entryName.endsWith('.csv')) {
          const filename = entry.entryName.replace('data/', '').replace('.csv', '');
          csvFiles[filename] = zip.readAsText(entry);
        }
      }

      // Validate required files
      for (const required of requiredFiles) {
        if (!csvFiles[required]) {
          return res.status(400).json({ 
            error: `Missing required CSV file: ${required}.csv` 
          });
        }
      }

      // Import project
      const result = await service.importProjectFromCSV(csvFiles);

      res.status(201).json({
        message: 'Project imported successfully',
        projectId: result.projectId,
        stats: result.stats
      });

    } catch (error) {
      console.error('Import error:', error);
      
      if (error.message.includes('violates')) {
        return res.status(400).json({ 
          error: 'Invalid data: ' + error.message 
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to import project: ' + error.message 
      });
    }
  }));

  /**
   * Validate ZIP file structure without importing
   * POST /api/import/validate
   */
  router.post('/validate', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();

      const foundFiles = {
        data: [],
        transcripts: [],
        readme: false
      };

      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('data/') && entry.entryName.endsWith('.csv')) {
          const filename = entry.entryName.replace('data/', '').replace('.csv', '');
          foundFiles.data.push(filename);
        } else if (entry.entryName.startsWith('transcripts/') && entry.entryName.endsWith('.vtt')) {
          foundFiles.transcripts.push(entry.entryName.replace('transcripts/', ''));
        } else if (entry.entryName === 'README.txt') {
          foundFiles.readme = true;
        }
      }

      const requiredFiles = ['project', 'files', 'codes', 'themes', 'insights'];
      const missingFiles = requiredFiles.filter(f => !foundFiles.data.includes(f));

      const valid = missingFiles.length === 0;

      res.json({
        valid,
        foundFiles,
        missingFiles,
        message: valid 
          ? 'ZIP file structure is valid' 
          : `Missing required files: ${missingFiles.join(', ')}`
      });

    } catch (error) {
      console.error('Validation error:', error);
      res.status(400).json({ 
        error: 'Invalid ZIP file: ' + error.message 
      });
    }
  }));

  return router;
}
