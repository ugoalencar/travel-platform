FROM node:24-alpine AS base
WORKDIR /app

# Copy workspace root config
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy workspace packages
COPY packages/domain/package.json packages/domain/
COPY services/api/package.json services/api/

# Install all workspace dependencies (including dev for build)
RUN npm install

# Copy source code
COPY packages/domain/ packages/domain/
COPY services/api/ services/api/

# Build domain first (dependency)
RUN cd packages/domain && npx tsc -p tsconfig.build.json

# Build API
RUN cd services/api && npx tsc -p tsconfig.build.json

# Production stage
FROM node:24-alpine AS production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY services/api/package.json services/api/

RUN npm install --omit=dev

COPY --from=base /app/packages/domain/dist packages/domain/dist/
COPY --from=base /app/services/api/dist services/api/dist/

ENV NODE_ENV=staging
ENV PORT=3000
EXPOSE 3000

CMD ["node", "services/api/dist/services/api/src/server.js"]
