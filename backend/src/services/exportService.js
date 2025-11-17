/**
 * Export Service
 * Handles exporting project data to CSV format
 */

import { arrayToCSV, flattenJSONB, joinArrayField, formatDate } from '../utils/csvUtils.js';

export default function exportService(pool) {
  /**
   * Fetch project data
   */
  async function getProjectData(projectId) {
    const result = await pool.query(
      'SELECT id, name, description, created_at FROM projects WHERE id = $1',
      [projectId]
    );
    return result.rows[0];
  }

  /**
   * Fetch all files for a project
   */
  async function getFilesData(projectId) {
    const result = await pool.query(
      'SELECT id, project_id, filename, content, created_at FROM files WHERE project_id = $1 ORDER BY created_at',
      [projectId]
    );
    return result.rows;
  }

  /**
   * Fetch all codes for a project
   */
  async function getCodesData(projectId) {
    const result = await pool.query(
      `SELECT c.id, c.file_id, c.code_name, c.text, c.start_offset, c.end_offset, 
              c.position, c.created_at
       FROM codes c
       JOIN files f ON c.file_id = f.id
       WHERE f.project_id = $1
       ORDER BY c.created_at`,
      [projectId]
    );
    return result.rows;
  }

  /**
   * Fetch all themes for a project
   */
  async function getThemesData(projectId) {
    const result = await pool.query(
      'SELECT id, project_id, name, code_ids, position, created_at FROM themes WHERE project_id = $1 ORDER BY created_at',
      [projectId]
    );
    return result.rows;
  }

  /**
   * Fetch all insights for a project
   */
  async function getInsightsData(projectId) {
    const result = await pool.query(
      'SELECT id, project_id, name, theme_ids, position, expanded, created_at FROM insights WHERE project_id = $1 ORDER BY created_at',
      [projectId]
    );
    return result.rows;
  }

  /**
   * Fetch all annotations for a project
   */
  async function getAnnotationsData(projectId) {
    const result = await pool.query(
      'SELECT id, project_id, content, position, created_at FROM annotations WHERE project_id = $1 ORDER BY created_at',
      [projectId]
    );
    return result.rows;
  }

  /**
   * Fetch all media files and related data for a project
   */
  async function getMediaData(projectId) {
    const mediaResult = await pool.query(
      `SELECT id, project_id, original_filename, mime_type, size_bytes, 
              status, duration_sec, storage_path, created_at
       FROM media_files
       WHERE project_id = $1
       ORDER BY created_at`,
      [projectId]
    );

    const media = mediaResult.rows;
    if (media.length === 0) {
      return { media: [], segments: [], participants: [] };
    }

    const mediaIds = media.map(m => m.id);

    // Fetch segments
    const segmentsResult = await pool.query(
      `SELECT id, media_file_id, participant_id, idx, start_ms, end_ms, text, created_at
       FROM transcript_segments
       WHERE media_file_id = ANY($1)
       ORDER BY media_file_id, idx`,
      [mediaIds]
    );

    // Fetch participants
    const participantsResult = await pool.query(
      `SELECT id, media_file_id, name, color, created_at
       FROM participants
       WHERE media_file_id = ANY($1)
       ORDER BY media_file_id, name`,
      [mediaIds]
    );

    return {
      media,
      segments: segmentsResult.rows,
      participants: participantsResult.rows
    };
  }

  /**
   * Generate project CSV
   */
  function generateProjectCSV(project) {
    if (!project) return '';
    
    const headers = ['id', 'name', 'description', 'created_at'];
    const row = {
      id: project.id,
      name: project.name,
      description: project.description || '',
      created_at: formatDate(project.created_at)
    };
    
    return arrayToCSV(headers, [row]);
  }

  /**
   * Generate files CSV
   */
  function generateFilesCSV(files) {
    if (!files || files.length === 0) {
      return 'id,project_id,filename,content,created_at\n';
    }
    
    const headers = ['id', 'project_id', 'filename', 'content', 'created_at'];
    // Filter out any files without filenames (should not happen, but defensive)
    const rows = files
      .filter(file => file.filename && file.filename.trim() !== '')
      .map(file => ({
        id: file.id,
        project_id: file.project_id,
        filename: file.filename,
        content: file.content || '',
        created_at: formatDate(file.created_at)
      }));
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate codes CSV with flattened position
   */
  function generateCodesCSV(codes) {
    if (!codes || codes.length === 0) {
      return 'id,file_id,code_name,text,start_offset,end_offset,position_x,position_y,created_at\n';
    }
    
    const headers = ['id', 'file_id', 'code_name', 'text', 'start_offset', 'end_offset', 
                     'position_x', 'position_y', 'created_at'];
    
    const rows = codes.map(code => {
      const flattened = flattenJSONB(code.position, 'position');
      
      return {
        id: code.id,
        file_id: code.file_id,
        code_name: code.code_name,
        text: code.text || '',
        start_offset: code.start_offset,
        end_offset: code.end_offset,
        position_x: flattened.position_x || '',
        position_y: flattened.position_y || '',
        created_at: formatDate(code.created_at)
      };
    });
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate themes CSV
   */
  function generateThemesCSV(themes) {
    if (!themes || themes.length === 0) {
      return 'id,project_id,name,code_ids,position_x,position_y,created_at\n';
    }
    
    const headers = ['id', 'project_id', 'name', 'code_ids', 
                     'position_x', 'position_y', 'created_at'];
    
    const rows = themes.map(theme => {
      const flattened = flattenJSONB(theme.position, 'position');
      
      return {
        id: theme.id,
        project_id: theme.project_id,
        name: theme.name,
        code_ids: joinArrayField(theme.code_ids),
        position_x: flattened.position_x || '',
        position_y: flattened.position_y || '',
        created_at: formatDate(theme.created_at)
      };
    });
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate insights CSV
   */
  function generateInsightsCSV(insights) {
    if (!insights || insights.length === 0) {
      return 'id,project_id,name,theme_ids,position_x,position_y,expanded,created_at\n';
    }
    
    const headers = ['id', 'project_id', 'name', 'theme_ids', 
                     'position_x', 'position_y', 'expanded', 'created_at'];
    
    const rows = insights.map(insight => {
      const flattened = flattenJSONB(insight.position, 'position');
      
      return {
        id: insight.id,
        project_id: insight.project_id,
        name: insight.name,
        theme_ids: joinArrayField(insight.theme_ids),
        position_x: flattened.position_x || '',
        position_y: flattened.position_y || '',
        expanded: insight.expanded ? 'true' : 'false',
        created_at: formatDate(insight.created_at)
      };
    });
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate annotations CSV
   */
  function generateAnnotationsCSV(annotations) {
    if (!annotations || annotations.length === 0) {
      return 'id,project_id,content,position_x,position_y,created_at\n';
    }
    
    const headers = ['id', 'project_id', 'content', 
                     'position_x', 'position_y', 'created_at'];
    
    const rows = annotations.map(annotation => {
      const flattened = flattenJSONB(annotation.position, 'position');
      
      return {
        id: annotation.id,
        project_id: annotation.project_id,
        content: annotation.content || '',
        position_x: flattened.position_x || '',
        position_y: flattened.position_y || '',
        created_at: formatDate(annotation.created_at)
      };
    });
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate media CSV
   */
  function generateMediaCSV(media) {
    if (!media || media.length === 0) {
      return 'id,project_id,original_filename,mime_type,size_bytes,status,duration_sec,storage_path,created_at\n';
    }
    
    const headers = ['id', 'project_id', 'original_filename', 'mime_type', 
                     'size_bytes', 'status', 'duration_sec', 'storage_path', 'created_at'];
    
    const rows = media.map(m => ({
      id: m.id,
      project_id: m.project_id,
      original_filename: m.original_filename,
      mime_type: m.mime_type,
      size_bytes: m.size_bytes,
      status: m.status,
      duration_sec: m.duration_sec || '',
      storage_path: m.storage_path,
      created_at: formatDate(m.created_at)
    }));
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate segments CSV
   */
  function generateSegmentsCSV(segments) {
    if (!segments || segments.length === 0) {
      return 'id,media_file_id,participant_id,idx,start_ms,end_ms,text,created_at\n';
    }
    
    const headers = ['id', 'media_file_id', 'participant_id', 'idx', 'start_ms', 'end_ms', 'text', 'created_at'];
    
    const rows = segments.map(seg => ({
      id: seg.id,
      media_file_id: seg.media_file_id,
      participant_id: seg.participant_id || '',
      idx: seg.idx,
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
      text: seg.text || '',
      created_at: formatDate(seg.created_at)
    }));
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Generate participants CSV
   */
  function generateParticipantsCSV(participants) {
    if (!participants || participants.length === 0) {
      return 'id,media_file_id,name,color,created_at\n';
    }
    
    const headers = ['id', 'media_file_id', 'name', 'color', 'created_at'];
    
    const rows = participants.map(p => ({
      id: p.id,
      media_file_id: p.media_file_id,
      name: p.name,
      color: p.color || '',
      created_at: formatDate(p.created_at)
    }));
    
    return arrayToCSV(headers, rows);
  }

  /**
   * Main export function
   */
  async function exportProjectToCSV(projectId) {
    // Fetch all data in parallel
    const [project, files, codes, themes, insights, annotations, mediaData] = await Promise.all([
      getProjectData(projectId),
      getFilesData(projectId),
      getCodesData(projectId),
      getThemesData(projectId),
      getInsightsData(projectId),
      getAnnotationsData(projectId),
      getMediaData(projectId)
    ]);

    if (!project) {
      throw new Error('Project not found');
    }

    // Generate CSV content for each entity type
    return {
      project: generateProjectCSV(project),
      files: generateFilesCSV(files),
      codes: generateCodesCSV(codes),
      themes: generateThemesCSV(themes),
      insights: generateInsightsCSV(insights),
      annotations: generateAnnotationsCSV(annotations),
      media: generateMediaCSV(mediaData.media),
      segments: generateSegmentsCSV(mediaData.segments),
      participants: generateParticipantsCSV(mediaData.participants)
    };
  }

  return {
    exportProjectToCSV
  };
}
