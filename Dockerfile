# Use official Playwright image with all browsers pre-installed
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install typescript tsx --save-dev

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Copy sessions directory (will contain google-session.json)
COPY sessions ./sessions

# Build TypeScript
RUN npm run build

# Expose the API port
EXPOSE 3000

# Default environment variables
ENV PORT=3000
ENV HEADLESS=true
ENV SESSION_DIR=./sessions
ENV MAX_CONCURRENT_SESSIONS=3

# Start the server
CMD ["node", "dist/index.js"]
