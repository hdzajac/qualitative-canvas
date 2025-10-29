# Backend Dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy source
COPY src ./src

EXPOSE 5000

CMD ["node", "src/index.js"]
