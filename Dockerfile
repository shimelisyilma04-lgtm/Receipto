# Stage 1: Build production artifacts
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies including devDependencies for build
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application source code
COPY . .

# Build Vite frontend and bundled Node server
RUN npm run build

# Remove development dependencies for clean distribution
RUN npm prune --production

# Stage 2: Minimal non-root production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl/wget for healthchecks
RUN apk --no-cache add curl

# Copy build artifacts and production modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Run as non-root user for security hardening
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server.cjs"]
