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
RUN npm run build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy only what's needed to serve
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
