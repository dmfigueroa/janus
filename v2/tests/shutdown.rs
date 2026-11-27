#![cfg(unix)]

use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, ExitStatus, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

#[test]
fn sigterm_exits_zero() {
    let database = migrated_database();
    let port = reserve_port();
    let log = Arc::new(Mutex::new(String::new()));
    let binary = std::env::var("CARGO_BIN_EXE_janus-v2")
        .or_else(|_| std::env::var("CARGO_BIN_EXE_janus_v2"))
        .expect("janus-v2 binary path");
    let mut child = Command::new(binary)
        .env("DATABASE_URL", &database.0)
        .env("JANUS_V2_BIND", format!("127.0.0.1:{port}"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn janus-v2");
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");
    drain(stdout, Arc::clone(&log));
    drain(stderr, Arc::clone(&log));
    let mut server = RunningServer { child: Some(child) };

    wait_until_live(port, server.child.as_mut().expect("child"), &log);
    let kill = Command::new("kill")
        .args([
            "-s",
            "TERM",
            &server.child.as_ref().expect("child").id().to_string(),
        ])
        .status()
        .expect("send SIGTERM");
    assert!(kill.success(), "kill failed\n{}", log_text(&log));

    let status = wait_for_exit(
        server.child.as_mut().expect("child"),
        Duration::from_secs(5),
        &log,
    );
    server.child = None;
    let observed = shell_exit_code(status);
    assert_eq!(
        observed,
        Some(0),
        "SIGTERM should exit 0, observed {observed:?}\n{}",
        log_text(&log)
    );
}

struct Database(PathBuf);

impl Drop for Database {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        for suffix in ["-wal", "-shm"] {
            let mut path = self.0.as_os_str().to_os_string();
            path.push(suffix);
            let _ = std::fs::remove_file(path);
        }
    }
}

struct RunningServer {
    child: Option<Child>,
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn migrated_database() -> Database {
    let path = std::env::temp_dir().join(format!(
        "janus-v2-shutdown-{}-{}.db",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let status = Command::new(std::env::var("JANUS_TEST_NODE").unwrap_or_else(|_| "node".into()))
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/create_v1_fixture.cjs"
        ))
        .arg(&path)
        .status()
        .expect("run v1 fixture migration");
    assert!(status.success(), "v1 fixture migration failed");
    Database(path)
}

fn reserve_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("reserve port");
    listener.local_addr().expect("port").port()
}

fn drain(pipe: impl Read + Send + 'static, log: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            log.lock().expect("log").push_str(&line);
            line.clear();
        }
    });
}

fn log_text(log: &Arc<Mutex<String>>) -> String {
    log.lock().expect("log").clone()
}

fn wait_until_live(port: u16, child: &mut Child, log: &Arc<Mutex<String>>) {
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().expect("poll startup") {
            panic!(
                "janus-v2 exited before listening: {:?}\n{}",
                shell_exit_code(status),
                log_text(log)
            );
        }
        if health_is_live(port) {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    panic!("timed out waiting for /v2/health/live\n{}", log_text(log));
}

fn health_is_live(port: u16) -> bool {
    let address = format!("127.0.0.1:{port}").parse().expect("health address");
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else {
        return false;
    };
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("read timeout");
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .expect("write timeout");
    let request = format!(
        "GET /v2/health/live HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buffer = Vec::new();
    let _ = stream.read_to_end(&mut buffer);
    let text = String::from_utf8_lossy(&buffer);
    text.contains("200") && text.contains("live")
}

fn wait_for_exit(child: &mut Child, limit: Duration, log: &Arc<Mutex<String>>) -> ExitStatus {
    let deadline = Instant::now() + limit;
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().expect("poll shutdown") {
            return status;
        }
        thread::sleep(Duration::from_millis(20));
    }
    panic!(
        "janus-v2 did not exit within {limit:?} after SIGTERM\n{}",
        log_text(log)
    );
}

fn shell_exit_code(status: ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;
    status
        .code()
        .or_else(|| status.signal().map(|signal| 128 + signal))
}
