# Backend Dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy source
COPY src ./src

# Version injected at build time by CI (e.g. v1.2.3); falls back to 'dev'
ARG VERSION=dev
ENV APP_VERSION=${VERSION}

EXPOSE 5000

CMD ["node", "src/index.js"]
