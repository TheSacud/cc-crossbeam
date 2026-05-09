FROM node:22-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22-slim AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends poppler-utils imagemagick && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY skills ./skills
COPY fixtures ./fixtures

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["node", "dist/index.js"]
