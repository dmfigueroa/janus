FROM rust:1.94.0-bookworm AS builder
WORKDIR /build
COPY v2/ ./
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/target/release/janus-v2 /usr/local/bin/janus-v2
ENV JANUS_V2_BIND=0.0.0.0:3001
EXPOSE 3001
# Smoke liveness only; /v2/health/ready remains 503 until database compatibility exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD curl --fail --silent http://127.0.0.1:3001/v2/health/live || exit 1
CMD ["janus-v2"]
