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

# The pre-commit hook lints staged Dockerfiles with hadolint. Pin the release and
# verify its published checksum so local linting matches what CI runs.
ARG HADOLINT_VERSION=2.12.0
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
    amd64) hadolint_arch=x86_64 ;; \
    arm64) hadolint_arch=arm64 ;; \
    *) echo "Unsupported architecture for hadolint: $arch" >&2; exit 1 ;; \
  esac \
  && cd /tmp \
  && curl -fsSLO "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-${hadolint_arch}" \
  && curl -fsSLO "https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-${hadolint_arch}.sha256" \
  && sha256sum -c "hadolint-Linux-${hadolint_arch}.sha256" \
  && mv "hadolint-Linux-${hadolint_arch}" /usr/local/bin/hadolint \
  && chmod +x /usr/local/bin/hadolint \
  && rm -f "hadolint-Linux-${hadolint_arch}.sha256"
