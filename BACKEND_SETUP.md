# Backend Setup Guide

This React frontend is ready to connect to your Node.js + Express backend. Follow this guide to set up the backend server.

## Database Schema

Create these tables in your SQLite or PostgreSQL database:

### Files Table
```sql
CREATE TABLE files (
  id VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Highlights Table
```sql
CREATE TABLE highlights (
  id VARCHAR(255) PRIMARY KEY,
  file_id VARCHAR(255) NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text TEXT NOT NULL,
  code_name VARCHAR(500) NOT NULL,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

### Themes Table
```sql
CREATE TABLE themes (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Theme_Highlights Junction Table
```sql
CREATE TABLE theme_highlights (
  theme_id VARCHAR(255) NOT NULL,
  highlight_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (theme_id, highlight_id),
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE,
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE
);
```

### Insights Table
```sql
CREATE TABLE insights (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  expanded BOOLEAN DEFAULT FALSE,
  position_x REAL,
  position_y REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Insight_Themes Junction Table
```sql
CREATE TABLE insight_themes (
  insight_id VARCHAR(255) NOT NULL,
  theme_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (insight_id, theme_id),
  FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);
```

### Annotations Table
```sql
CREATE TABLE annotations (
  id VARCHAR(255) PRIMARY KEY,
  content TEXT NOT NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Express Server Setup

### 1. Initialize Node.js Project

```bash
mkdir backend
cd backend
npm init -y
```

### 2. Install Dependencies

```bash
# For SQLite
npm install express cors sqlite3 body-parser

# OR for PostgreSQL
npm install express cors pg body-parser
```

### 3. Create Express Server (server.js)

```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose(); // or use pg for PostgreSQL

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Database setup (SQLite example)
const db = new sqlite3.Database('./qualitative-data.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeTables();
  }
});

// Initialize tables
function initializeTables() {
  // Create all tables here using the schema above
  // Example for files table:
  db.run(`CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(255) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Add other tables...
}

// ============ FILE ENDPOINTS ============

app.post('/api/files', (req, res) => {
  const { filename, content } = req.body;
  const id = Date.now().toString();
  const createdAt = new Date().toISOString();

  db.run(
    'INSERT INTO files (id, filename, content, created_at) VALUES (?, ?, ?, ?)',
    [id, filename, content, createdAt],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id, filename, content, createdAt });
    }
  );
});

app.get('/api/files', (req, res) => {
  db.all('SELECT * FROM files ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/files/:id', (req, res) => {
  db.get('SELECT * FROM files WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || null);
  });
});

// ============ HIGHLIGHT ENDPOINTS ============

app.post('/api/highlights', (req, res) => {
  const { fileId, startOffset, endOffset, text, codeName, position } = req.body;
  const id = Date.now().toString();
  const createdAt = new Date().toISOString();

  db.run(
    'INSERT INTO highlights (id, file_id, start_offset, end_offset, text, code_name, position_x, position_y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, fileId, startOffset, endOffset, text, codeName, position?.x, position?.y, createdAt],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ 
        id, 
        fileId, 
        startOffset, 
        endOffset, 
        text, 
        codeName, 
        position,
        createdAt 
      });
    }
  );
});

app.get('/api/highlights', (req, res) => {
  db.all('SELECT * FROM highlights ORDER BY created_at ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Transform position columns back to object
    const highlights = rows.map(row => ({
      ...row,
      position: row.position_x ? { x: row.position_x, y: row.position_y } : undefined
    }));
    res.json(highlights);
  });
});

app.put('/api/highlights/:id', (req, res) => {
  const updates = req.body;
  const fields = [];
  const values = [];

  if (updates.codeName !== undefined) {
    fields.push('code_name = ?');
    values.push(updates.codeName);
  }
  if (updates.position !== undefined) {
    fields.push('position_x = ?', 'position_y = ?');
    values.push(updates.position.x, updates.position.y);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id);
  const sql = `UPDATE highlights SET ${fields.join(', ')} WHERE id = ?`;

  db.run(sql, values, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Return updated record
    db.get('SELECT * FROM highlights WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        ...row,
        position: row.position_x ? { x: row.position_x, y: row.position_y } : undefined
      });
    });
  });
});

app.delete('/api/highlights/:id', (req, res) => {
  db.run('DELETE FROM highlights WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// ============ THEME ENDPOINTS ============
// Similar pattern for themes, insights, and annotations
// See the API service file (src/services/api.ts) for complete endpoint specifications

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
```

## 4. Update Frontend Configuration

Once your backend is running, update `src/services/api.ts`:

```typescript
const BASE_URL = 'http://localhost:3000/api'; // Update if needed
```

Then comment out or remove the mock storage functions and uncomment the actual API calls.

## 5. Run Your Stack

### Terminal 1 (Backend):
```bash
cd backend
node server.js
```

### Terminal 2 (Frontend):
```bash
npm run dev
```

## Notes

- The frontend currently uses localStorage as a mock backend for development
- All API endpoints are documented in `src/services/api.ts`
- The database schema supports all features including drag-and-drop positioning
- For production, consider adding authentication, validation, and error handling
- You can export this Lovable project and integrate your backend seamlessly

## Export from Lovable

1. Click your project name → Settings → "Download code"
2. Extract the files to your local machine
3. Run `npm install`
4. Set up the backend following this guide
5. Run both servers and enjoy full-stack local development!
