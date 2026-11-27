use std::{future::Future, net::SocketAddr, process::ExitCode};

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Janus v2 startup failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let address: SocketAddr = std::env::var("JANUS_V2_BIND")
        .unwrap_or_else(|_| "127.0.0.1:3001".into())
        .parse()?;
    let path = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
    let database = janus_v2::open_database(std::path::Path::new(&path)).await?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    eprintln!(
        "Janus v2 listening on {}; database compatibility validated",
        listener.local_addr()?
    );
    axum::serve(listener, janus_v2::database_router(database))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    eprintln!("Janus v2 shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let interrupt = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        listen_for_shutdown(interrupt).await;
    }
    #[cfg(not(unix))]
    {
        if let Err(error) = interrupt.await {
            eprintln!("Janus v2 failed to listen for interrupt: {error}");
        }
    }
    eprintln!("Janus v2 shutdown signaled");
}

#[cfg(unix)]
async fn listen_for_shutdown(interrupt: impl Future<Output = std::io::Result<()>>) {
    match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
        Ok(mut terminate) => {
            tokio::select! {
                result = interrupt => {
                    if let Err(error) = result {
                        eprintln!("Janus v2 failed to listen for interrupt: {error}");
                    }
                }
                _ = terminate.recv() => {}
            }
        }
        Err(error) => {
            eprintln!("Janus v2 failed to listen for SIGTERM: {error}");
            if let Err(interrupt_error) = interrupt.await {
                eprintln!("Janus v2 failed to listen for interrupt: {interrupt_error}");
            }
        }
    }
}
