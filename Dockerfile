# Step 1: Base Image (ensure this matches your setup, e.g., node:20-bookworm-slim or node:22-bookworm-slim)
FROM node:20-bookworm-slim

ARG LIBRAW_VERSION=0.21.4
ARG LIBVIPS_VERSION=8.16.1

WORKDIR /app

# Step 2: System Dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake meson ninja-build pkg-config \
    libglib2.0-dev libexpat1-dev libjpeg-dev liblcms2-dev libpng-dev \
    libtiff5-dev libwebp-dev libheif-dev libopenjp2-7-dev libgif-dev \
    libgsf-1-dev libexif-dev libxml2-dev libfftw3-dev \
    wget tar xz-utils ca-certificates \
    libimage-exiftool-perl \
    && rm -rf /var/lib/apt/lists/*

# Step 3: Build and install LibRaw from source (provides dcraw_emu)
RUN echo "--- Building LibRaw v${LIBRAW_VERSION} from source ---" && \
    cd /tmp && \
    wget "https://www.libraw.org/data/LibRaw-${LIBRAW_VERSION}.tar.gz" -O "LibRaw-${LIBRAW_VERSION}.tar.gz" && \
    tar -xzf "LibRaw-${LIBRAW_VERSION}.tar.gz" && \
    cd "LibRaw-${LIBRAW_VERSION}" && \
    ./configure --prefix=/usr/local && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    echo "--- LibRaw v${LIBRAW_VERSION} installation complete. ---" && \
    (ls -l /usr/local/bin/dcraw_emu && echo "dcraw_emu found.") || (echo "Error: dcraw_emu NOT found." && exit 1) && \
    (ls -l /usr/local/bin/raw_identify && echo "raw_identify found.") || echo "Warning: raw_identify not found." && \
    cd / && \
    rm -rf /tmp/*

# Step 4: Build and install libvips from source (for sharp)
ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig
RUN echo "--- Diagnostic: Checking if pkg-config finds custom libraw (target: ${LIBRAW_VERSION}) ---" && \
    (pkg-config --exists libraw && pkg-config --modversion libraw && echo "LibRaw FOUND by pkg-config") || \
    (echo "Error: pkg-config could NOT find custom libraw." && exit 1) && \
    echo "--- Building libvips v${LIBVIPS_VERSION} from source ---" && \
    cd /tmp && \
    wget "https://github.com/libvips/libvips/releases/download/v${LIBVIPS_VERSION}/vips-${LIBVIPS_VERSION}.tar.xz" -O "vips-${LIBVIPS_VERSION}.tar.xz" && \
    tar -xJf "vips-${LIBVIPS_VERSION}.tar.xz" && \
    cd "vips-${LIBVIPS_VERSION}" && \
    meson setup build --prefix=/usr/local --libdir=lib --buildtype=release -Dintrospection=disabled && \
    cd build && ninja && ninja install && ldconfig && cd / && rm -rf /tmp/*

# Step 5: Diagnostic: Confirm custom libvips version
RUN echo "--- Diagnostic: CUSTOM libvips (target: v${LIBVIPS_VERSION}) ---" && \
    (pkg-config --modversion vips-cpp || echo "Error: pkg-config could not find custom vips-cpp.") && \
    echo "--- End Diagnostic ---"

# Step 6: Setup pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Step 7: Application setup
WORKDIR /app
COPY .npmrc .npmrc
COPY package.json pnpm-lock.yaml ./

# Step 8: Set environment variables for sharp build
ENV npm_config_sharp_build_from_source=true
ENV SHARP_FORCE_GLOBAL_LIBVIPS=true

# Step 9: Install Node.js dependencies (exiftool-vendored will be removed from package.json)
RUN pnpm install --frozen-lockfile --reporter=verbose

# Step 10: Copy rest of the application code
COPY . .

# Step 11: Build Next.js application
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]