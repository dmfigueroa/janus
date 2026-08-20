FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    g++ \
    git \
    make \
    openssh-client \
    python3 \
  && rm -rf /var/lib/apt/lists/*
