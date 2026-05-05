# Frontend Dockerfile
FROM node:20 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install

FROM node:20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Bake the API URL into the build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# Version injected at build time by CI (e.g. v1.2.3); falls back to 'dev'
ARG VERSION=dev
ENV VITE_APP_VERSION=${VERSION}
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
