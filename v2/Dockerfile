# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# builder — compile the release binary. Dependency compilation is cached in a
# separate layer keyed only on the manifests, so source changes do not rebuild
# the (large) dependency graph.
# ---------------------------------------------------------------------------
FROM rust:1.94.0-bookworm AS builder
WORKDIR /build

# Strip symbols for a smaller binary. Set before the stub build so both cargo
# invocations share one profile and the dependency cache stays valid.
ENV CARGO_PROFILE_RELEASE_STRIP=true

# Build a stub crate first to compile and cache the full dependency graph.
COPY v2/Cargo.toml v2/Cargo.lock v2/build.rs ./
RUN mkdir -p src static \
  && echo 'fn main() {}' > src/main.rs \
  && echo '' > src/lib.rs \
  && echo '' > static/app.css \
  && cargo build --locked --release \
  && rm -rf src

# Copy the real sources. Templates and static assets are embedded at compile time.
COPY v2/src ./src
COPY v2/templates ./templates
COPY v2/static ./static
# Cargo compares source mtimes with the stub artifacts. Git checkout files can be older
# than the stub build, so touch the copied sources to force the application crate to
# rebuild while keeping dependency artifacts cached.
RUN find src templates static -type f -exec touch {} + \
  && cargo build --locked --release \
  && test "$(stat -c %s target/release/janus-v2)" -gt 1000000

# ---------------------------------------------------------------------------
# runner — minimal image with only the binary and the healthcheck's curl.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/target/release/janus-v2 /usr/local/bin/janus-v2
ENV JANUS_V2_BIND=0.0.0.0:3001
EXPOSE 3001
# Liveness is separate from database compatibility readiness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl --fail --silent http://127.0.0.1:3001/v2/health/live || exit 1
CMD ["janus-v2"]
