/**
 * CSV Utility Functions
 * Handles CSV field escaping, array conversion, and JSONB flattening
 */

/**
 * Escape a CSV field according to RFC 4180
 * - Wrap in quotes if contains comma, quote, or newline
 * - Escape quotes by doubling them
 * @param {*} field - The field value to escape
 * @returns {string} - Escaped field
 */
export function escapeCSVField(field) {
  if (field == null) return '';
  const str = String(field);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert array of objects to CSV string
 * @param {string[]} headers - Array of header names (object keys)
 * @param {Object[]} rows - Array of row objects
 * @returns {string} - CSV formatted string
 */
export function arrayToCSV(headers, rows) {
  const headerLine = headers.map(escapeCSVField).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSVField(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Flatten JSONB object to flat structure with underscored keys
 * Example: { position: { x: 100, y: 200 } } → { position_x: 100, position_y: 200 }
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for nested keys
 * @returns {Object} - Flattened object
 */
export function flattenJSONB(obj, prefix = '') {
  const flattened = {};
  if (!obj) return flattened;

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenJSONB(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  }
  return flattened;
}

/**
 * Join array field with semicolon delimiter for CSV compatibility
 * @param {Array} arr - Array to join
 * @returns {string} - Semicolon-delimited string
 */
export function joinArrayField(arr) {
  return arr && arr.length ? arr.join(';') : '';
}

/**
 * Format a date for CSV output
 * @param {Date|string} date - Date to format
 * @returns {string} - ISO formatted date
 */
export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}
