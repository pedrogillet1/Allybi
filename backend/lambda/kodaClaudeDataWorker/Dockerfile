FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY index.mjs ./
COPY documentsPrompts.mjs ./
COPY documentsSchema.mjs ./
COPY rateLimiter.mjs ./

# Cloud Run uses PORT env variable
ENV PORT=8080

# Start the server
CMD ["node", "index.mjs"]
