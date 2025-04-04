##
# 1) BUILDER STAGE
##
FROM node:20-slim AS builder

# Install PNPM and dependencies
RUN npm install -g pnpm@9.15.4 && \
    apt-get update && apt-get upgrade -y && \
    apt-get install -y git python3 python3-pip python3-venv python3-dev curl node-gyp make g++ build-essential openssl libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . $HOME/.cargo/env && rustup default stable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure Rust is in PATH
ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME=/root/.rustup
ENV CARGO_HOME=/root/.cargo

WORKDIR /app


# Copy configuration files for the workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json client/
COPY server/package.json server/
COPY agents/package.json agents/
COPY plugins plugins

# Install all dependencies (including devDependencies)
RUN pnpm install --frozen-lockfile

# Copy the rest of the code
COPY . .

# Complete build (Nest, Next, etc.)
RUN pnpm run build


#####
# PYTHON STAGE
#####
FROM python:3.11-slim AS python-deps

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential curl make g++ libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . $HOME/.cargo/env && rustup default stable

ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME=/root/.rustup
ENV CARGO_HOME=/root/.cargo

RUN mkdir -p /app/scripts/paradex-python/.venv
COPY scripts/paradex-python/requirements.txt /app/scripts/paradex-python/
RUN python -m pip install --upgrade pip && \
    pip install --target=/app/scripts/paradex-python/.venv/lib/python3.11/site-packages --no-cache-dir -r /app/scripts/paradex-python/requirements.txt && \
    mkdir -p /app/scripts/paradex-python/.venv/bin && \
    ln -s /usr/local/bin/python /app/scripts/paradex-python/.venv/bin/python && \
    ln -s /usr/local/bin/python3 /app/scripts/paradex-python/.venv/bin/python3 && \
    echo '# This file must be used with "source bin/activate" from bash' > /app/scripts/paradex-python/.venv/bin/activate && \
    echo 'export VIRTUAL_ENV="/app/scripts/paradex-python/.venv"' >> /app/scripts/paradex-python/.venv/bin/activate && \
    echo 'export PATH="$VIRTUAL_ENV/bin:$PATH"' >> /app/scripts/paradex-python/.venv/bin/activate && \
    echo 'export PYTHONPATH="$VIRTUAL_ENV/lib/python3.11/site-packages:$PYTHONPATH"' >> /app/scripts/paradex-python/.venv/bin/activate

#####
# FINAL STAGE
#####
FROM node:20-slim

RUN npm install -g pnpm@9.15.4 lerna@8.2.0 && \
    apt-get update && apt-get upgrade -y && \
    apt-get install -y \
       python3 python3-pip python3-venv python3.11-venv \
       build-essential curl openssl libssl-dev \
       postgresql postgresql-contrib && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . $HOME/.cargo/env && rustup default stable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*


ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME=/root/.rustup
ENV CARGO_HOME=/root/.cargo
ENV PATH="/app/node_modules/.bin:${PATH}"

WORKDIR /app

# Copy configuration files and workspace structure from the builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json client/
COPY server/package.json server/
COPY agents/package.json agents/
COPY plugins plugins

# Reinstall dependencies in production (this will recreate all links correctly in the final environment)
RUN pnpm install --frozen-lockfile

# Copy build artifacts from the builder (server, client, agents builds, etc.)
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/agents/dist ./agents/dist
COPY --from=builder /app/client/.next ./client/.next
COPY --from=builder /app/client/public ./client/public
COPY --from=builder /app/lerna.json ./lerna.json
COPY --from=builder /app/turbo.json ./turbo.json
COPY --from=builder /app/scripts ./scripts

# Copy Python environment from the python-deps stage
COPY --from=python-deps /app/scripts/paradex-python/.venv ./scripts/paradex-python/.venv
ENV PYTHONPATH="/app/scripts/paradex-python/.venv/lib/python3.11/site-packages:${PYTHONPATH}"
ENV PATH="/app/scripts/paradex-python/.venv/bin:${PATH}"

EXPOSE 8080

COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chmod +x /app/scripts/onboarding.sh || true

ENTRYPOINT ["/entrypoint.sh"]