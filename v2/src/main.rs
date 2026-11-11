use std::{net::SocketAddr, process::ExitCode};

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
    let listener = tokio::net::TcpListener::bind(address).await?;
    eprintln!(
        "Janus v2 listening on {}; database readiness unavailable",
        listener.local_addr()?
    );
    axum::serve(listener, janus_v2::router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
