FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    libraw-dev \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]