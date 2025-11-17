# Deployment Guide

This guide covers different deployment scenarios for Qualitative Canvas using pre-built Docker images.

## Table of Contents

- [Understanding GitHub Packages](#understanding-github-packages)
- [Quick Start](#quick-start)
- [Production Deployment](#production-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Database Management](#database-management)
- [Backup and Restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

## Understanding GitHub Packages

### What's Included in the Container Registry

GitHub Container Registry provides **pre-built application images only**:

```
ghcr.io/hdzajac/qualitative-canvas-backend:latest
├── Node.js 18
├── Express API server
├── All dependencies installed
└── Application code

ghcr.io/hdzajac/qualitative-canvas-frontend:latest
├── Nginx web server
├── Built React application
└── Optimized static assets
```

### What's NOT Included

❌ **PostgreSQL Database** - You must provide your own database

### Why is the Database Separate?

- ✅ **Data persistence** across application updates
- ✅ **Flexibility** to use managed databases (AWS RDS, Google Cloud SQL, etc.)
- ✅ **Better security** and backup control
- ✅ **Easier scaling** - database can be sized independently
- ✅ **Multiple environments** can share a database cluster

### Architecture Overview

```
┌─────────────┐      ┌─────────────┐      ┌──────────────┐
│   Browser   │─────▶│  Frontend   │─────▶│   Backend    │
│             │      │  (Nginx)    │      │  (Node.js)   │
└─────────────┘      └─────────────┘      └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  PostgreSQL  │
                                          │  (You provide)│
                                          └──────────────┘
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- 4GB RAM minimum, 8GB recommended
- 10GB disk space for database and media files

### Option 1: All-in-One Setup (Recommended for Testing)

This runs everything locally including a PostgreSQL database.

1. **Download production files**:
   ```bash
   curl -o docker-compose.yml https://raw.githubusercontent.com/hdzajac/qualitative-canvas/main/docker-compose.prod.yml
   curl -o .env https://raw.githubusercontent.com/hdzajac/qualitative-canvas/main/.env.prod.example
   ```

2. **Configure environment**:
   ```bash
   # Edit .env and set secure passwords
   nano .env
   
   # IMPORTANT: Change these values:
   # POSTGRES_PASSWORD=your_secure_password_here
   # SESSION_SECRET=your_random_32_char_string_here
   ```

   Generate secure values:
   ```bash
   # Generate secure password
   openssl rand -base64 32
   
   # Generate session secret
   openssl rand -base64 48
   ```

3. **Start the application**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5002
   - Health check: http://localhost:5002/api/health

5. **View logs**:
   ```bash
   # All services
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f backend
   ```

6. **Stop the application**:
   ```bash
   docker-compose down
   ```

### Option 2: External Database (For Production)

If you have an existing PostgreSQL database (AWS RDS, Google Cloud SQL, managed hosting, etc.):

1. **Create docker-compose.yml**:
   ```yaml
   version: '3.8'
   
   services:
     backend:
       image: ghcr.io/hdzajac/qualitative-canvas-backend:latest
       restart: unless-stopped
       environment:
         DATABASE_HOST: your-db-host.amazonaws.com
         DATABASE_PORT: 5432
         DATABASE_NAME: qualitative_canvas
         DATABASE_USER: your_db_user
         DATABASE_PASSWORD: your_db_password
         SESSION_SECRET: your_secure_random_string
         PORT: 5002
         NODE_ENV: production
       volumes:
         - ./media:/app/data/media
       ports:
         - "5002:5002"
   
     frontend:
       image: ghcr.io/hdzajac/qualitative-canvas-frontend:latest
       restart: unless-stopped
       environment:
         VITE_API_URL: http://localhost:5002
       ports:
         - "3000:80"
   ```

2. **Initialize database** (first time only):
   ```bash
   # The backend will automatically run migrations on startup
   # Or manually run:
   psql -h your-db-host -U your-user -d qualitative_canvas < backend/src/db/baseSchema.js
   ```

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

## Production Deployment

### Best Practices

1. **Use managed database service**:
   - AWS RDS for PostgreSQL
   - Google Cloud SQL
   - Azure Database for PostgreSQL
   - DigitalOcean Managed Databases
   - Heroku Postgres

2. **Enable SSL/TLS**:
   - Use reverse proxy (Nginx, Traefik, Caddy)
   - Get SSL certificates (Let's Encrypt)

3. **Set up monitoring**:
   - Application logs
   - Database performance
   - Disk usage for media files

4. **Configure backups**:
   - Database automated backups
   - Media files backup
   - Regular testing of restore procedures

### Example with Nginx Reverse Proxy

1. **Create nginx config** (`/etc/nginx/sites-available/qualitative-canvas`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       # Redirect to HTTPS
       return 301 https://$server_name$request_uri;
   }
   
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       
       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
       
       # Frontend
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       # Backend API
       location /api {
           proxy_pass http://localhost:5002;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           
           # WebSocket support (if needed)
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

2. **Enable and restart nginx**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/qualitative-canvas /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Cloud Deployment

### AWS (ECS + RDS)

1. **Create RDS PostgreSQL instance**
   - Engine: PostgreSQL 15
   - Instance class: db.t3.medium or larger
   - Storage: 20GB+ SSD
   - Enable automated backups
   - Create security group allowing port 5432

2. **Create ECS Cluster**
   ```bash
   aws ecs create-cluster --cluster-name qualitative-canvas
   ```

3. **Create task definition** (`task-definition.json`):
   ```json
   {
     "family": "qualitative-canvas",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "1024",
     "memory": "2048",
     "containerDefinitions": [
       {
         "name": "backend",
         "image": "ghcr.io/hdzajac/qualitative-canvas-backend:latest",
         "portMappings": [{"containerPort": 5002}],
         "environment": [
           {"name": "DATABASE_HOST", "value": "your-rds.amazonaws.com"},
           {"name": "DATABASE_NAME", "value": "qualitative_canvas"},
           {"name": "NODE_ENV", "value": "production"}
         ],
         "secrets": [
           {"name": "DATABASE_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..."},
           {"name": "SESSION_SECRET", "valueFrom": "arn:aws:secretsmanager:..."}
         ]
       },
       {
         "name": "frontend",
         "image": "ghcr.io/hdzajac/qualitative-canvas-frontend:latest",
         "portMappings": [{"containerPort": 80}],
         "environment": [
           {"name": "VITE_API_URL", "value": "https://api.your-domain.com"}
         ]
       }
     ]
   }
   ```

4. **Deploy**:
   ```bash
   aws ecs register-task-definition --cli-input-json file://task-definition.json
   aws ecs create-service --cluster qualitative-canvas --service-name app --task-definition qualitative-canvas
   ```

### DigitalOcean App Platform

1. **Create Managed PostgreSQL database** in DigitalOcean control panel

2. **Create App from Docker Hub**:
   - Go to Apps → Create App
   - Choose "Docker Hub" or "GitHub Container Registry"
   - Repository: `ghcr.io/hdzajac/qualitative-canvas-backend`
   - Add environment variables from database connection

3. **Or use app spec** (`app.yaml`):
   ```yaml
   name: qualitative-canvas
   
   databases:
     - name: db
       engine: PG
       version: "15"
       size: basic-xs
   
   services:
     - name: backend
       image:
         registry_type: GHCR
         repository: hdzajac/qualitative-canvas-backend
         tag: latest
       instance_count: 1
       instance_size_slug: basic-xs
       envs:
         - key: DATABASE_HOST
           value: ${db.HOSTNAME}
         - key: DATABASE_PORT
           value: ${db.PORT}
         - key: DATABASE_NAME
           value: ${db.DATABASE}
         - key: DATABASE_USER
           value: ${db.USERNAME}
         - key: DATABASE_PASSWORD
           value: ${db.PASSWORD}
         - key: SESSION_SECRET
           type: SECRET
           value: YOUR_SECRET_HERE
       http_port: 5002
   
     - name: frontend
       image:
         registry_type: GHCR
         repository: hdzajac/qualitative-canvas-frontend
         tag: latest
       instance_count: 1
       instance_size_slug: basic-xs
       http_port: 80
       envs:
         - key: VITE_API_URL
           value: ${backend.PUBLIC_URL}
   ```

4. **Deploy**:
   ```bash
   doctl apps create --spec app.yaml
   ```

## Database Management

### Automatic Migrations

The backend automatically runs database migrations on startup. No manual intervention needed.

### Manual Database Setup

If you need to manually initialize the database:

```bash
# Using the backend container
docker-compose exec backend node src/db/migrate.js

# Or connect directly to PostgreSQL
psql -h localhost -U postgres -d qualitative_canvas
```

### Connection String Format

```
postgresql://username:password@host:port/database
```

Example:
```
postgresql://admin:secret@mydb.rds.amazonaws.com:5432/qualitative_canvas
```

## Backup and Restore

### Database Backup

```bash
# Backup
docker-compose exec db pg_dump -U postgres qualitative_canvas > backup.sql

# Or with managed database
pg_dump -h your-db-host -U admin qualitative_canvas > backup.sql
```

### Media Files Backup

```bash
# Backup media files volume
docker run --rm -v qualitative-canvas_media_files:/data -v $(pwd):/backup \
  alpine tar czf /backup/media-backup.tar.gz /data
```

### Restore

```bash
# Restore database
cat backup.sql | docker-compose exec -T db psql -U postgres qualitative_canvas

# Restore media files
docker run --rm -v qualitative-canvas_media_files:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/media-backup.tar.gz --strip 1"
```

## Updating to Latest Version

```bash
# Pull latest images
docker-compose pull

# Restart services (automatic migration will run)
docker-compose up -d

# View logs to confirm update
docker-compose logs -f backend
```

Your data is preserved in Docker volumes (`postgres_data` and `media_files`).

## Troubleshooting

### Backend won't connect to database

```bash
# Check if database is ready
docker-compose exec db pg_isready -U postgres

# Check backend logs
docker-compose logs backend

# Verify environment variables
docker-compose exec backend env | grep DATABASE
```

### Frontend can't reach backend

```bash
# Check if backend is running
curl http://localhost:5002/api/health

# Check frontend environment
docker-compose exec frontend env | grep VITE_API_URL
```

### Out of disk space

```bash
# Check Docker disk usage
docker system df

# Clean up unused images/volumes
docker system prune -a --volumes
```

### Performance issues

```bash
# Check resource usage
docker stats

# Check database performance
docker-compose exec db psql -U postgres -d qualitative_canvas -c "SELECT * FROM pg_stat_activity;"
```

## Security Checklist

- [ ] Changed default `POSTGRES_PASSWORD`
- [ ] Changed default `SESSION_SECRET` (min 32 characters)
- [ ] Enabled SSL/TLS with valid certificates
- [ ] Database not exposed to public internet
- [ ] Regular automated backups configured
- [ ] Database and media file backups tested
- [ ] Application logs monitored
- [ ] OS and Docker kept up to date

## Support

For issues or questions:
- GitHub Issues: https://github.com/hdzajac/qualitative-canvas/issues
- Documentation: https://github.com/hdzajac/qualitative-canvas
