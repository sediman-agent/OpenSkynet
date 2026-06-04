//! Update installer - downloads and installs the new TUI binary.

use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

/// Install the latest update.
///
/// This function:
/// 1. Detects the current platform
/// 2. Downloads the appropriate binary from GitHub releases
/// 3. Replaces the current binary
/// 4. Returns success so the caller can restart the TUI
pub async fn install_update(version: &str) -> Result<()> {
    let platform = detect_platform();
    let binary_url = format!(
        "https://github.com/sediman-agent/OpenSkynet/releases/download/v{}/sediman-{}-{}.tar.gz",
        version, version, platform
    );

    // Download to temporary location
    let temp_dir = std::env::temp_dir();
    let archive_path = temp_dir.join(format!("sediman-{}-{}.tar.gz", version, platform));

    tracing::info!("Downloading update from: {}", binary_url);

    let response = reqwest::get(&binary_url)
        .await
        .context("Failed to download update archive")?;

    if !response.status().is_success() {
        // Fall back to building from source if pre-built binary is not available
        if response.status() == 404 {
            tracing::warn!("Pre-built binary not found (404), falling back to building from source");
            return build_from_source(version).await;
        }
        anyhow::bail!(
            "Failed to download update: HTTP {}",
            response.status()
        );
    }

    let bytes = response
        .bytes()
        .await
        .context("Failed to read update archive")?;

    fs::write(&archive_path, bytes)
        .context("Failed to write update archive")?;

    tracing::info!("Extracting update archive");

    // Extract the archive
    let extract_dir = temp_dir.join(format!("sediman-{}-{}", version, platform));
    fs::create_dir_all(&extract_dir)
        .context("Failed to create extract directory")?;

    extract_tar_gz(&archive_path, &extract_dir)
        .context("Failed to extract update archive")?;

    // Find the extracted binary
    let binary_name = if cfg!(target_os = "windows") {
        "sediman-tui.exe"
    } else {
        "sediman-tui"
    };

    let new_binary = extract_dir.join(binary_name);
    if !new_binary.exists() {
        anyhow::bail!("Update archive did not contain expected binary");
    }

    // Get current executable path
    let current_exe = std::env::current_exe()
        .context("Failed to get current executable path")?;

    tracing::info!("Replacing binary at: {:?}", current_exe);

    // On Unix systems, we can't directly replace the running executable
    // We need to move it aside first, then copy the new one, then remove the old one
    #[cfg(unix)]
    {
        let temp_backup = current_exe.with_extension("old");
        fs::rename(&current_exe, &temp_backup)
            .context("Failed to move old binary aside")?;

        fs::copy(&new_binary, &current_exe)
            .context("Failed to copy new binary")?;

        // Make it executable
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&current_exe)
            .context("Failed to get binary permissions")?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&current_exe, perms)
            .context("Failed to set binary permissions")?;

        // Clean up
        let _ = fs::remove_file(temp_backup);
    }

    #[cfg(windows)]
    {
        // On Windows, we can't replace the running executable directly
        // We'll move it to a temporary location with a special name
        // and schedule it to be replaced on next restart
        let temp_path = current_exe.with_extension(".new");

        fs::copy(&new_binary, &temp_path)
            .context("Failed to copy new binary")?;

        // Use MoveFileEx to schedule replacement on reboot
        // For now, just inform the user
        anyhow::bail!(
            "On Windows, please manually replace {:?} with {:?}",
            current_exe,
            new_binary
        );
    }

    // Clean up temporary files
    let _ = fs::remove_file(archive_path);
    let _ = fs::remove_dir_all(extract_dir);

    tracing::info!("Update installed successfully");

    Ok(())
}

/// Detect the current platform for download.
fn detect_platform() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "macos-arm64";

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "macos-x86_64";

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "linux-x86_64";

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "linux-arm64";

    #[cfg(target_os = "windows")]
    return "windows-x86_64";

    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        target_os = "windows"
    )))]
    {
        panic!("Unsupported platform for auto-update");
    }
}

/// Build the TUI from source by cloning the repository and running cargo build.
async fn build_from_source(version: &str) -> Result<()> {
    use std::process::Command;

    tracing::info!("Building TUI from source for version {}", version);

    let temp_dir = std::env::temp_dir();
    let source_dir = temp_dir.join(format!("sediman-source-{}", version));

    // Clean up any existing directory
    if source_dir.exists() {
        fs::remove_dir_all(&source_dir)?;
    }

    // Clone the repository at the specific version tag
    tracing::info!("Cloning repository at tag v{}...", version);
    let clone_result = Command::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            "--branch",
            &format!("v{}", version),
            "https://github.com/sediman-agent/OpenSkynet.git",
            source_dir.to_string_lossy().as_ref(),
        ])
        .output()
        .context("Failed to clone repository")?;

    if !clone_result.status.success() {
        let error_msg = String::from_utf8_lossy(&clone_result.stderr);
        anyhow::bail!("Failed to clone repository: {}", error_msg);
    }

    // Build the TUI using cargo
    tracing::info!("Building TUI with cargo (this may take a few minutes)...");
    let build_result = Command::new("cargo")
        .args([
            "build",
            "--release",
            "--package",
            "sediman-tui",
        ])
        .current_dir(&source_dir)
        .output()
        .context("Failed to build TUI")?;

    if !build_result.status.success() {
        let error_msg = String::from_utf8_lossy(&build_result.stderr);
        anyhow::bail!("Failed to build TUI: {}", error_msg);
    }

    // Find the built binary
    let built_binary = source_dir.join("target/release/terminator");
    if !built_binary.exists() {
        anyhow::bail!("Build succeeded but binary not found at target/release/terminator");
    }

    // Get current executable path
    let current_exe = std::env::current_exe()
        .context("Failed to get current executable path")?;

    tracing::info!("Replacing binary at: {:?}", current_exe);

    // Replace the binary
    #[cfg(unix)]
    {
        let temp_backup = current_exe.with_extension("old");
        fs::rename(&current_exe, &temp_backup)
            .context("Failed to move old binary aside")?;

        fs::copy(&built_binary, &current_exe)
            .context("Failed to copy new binary")?;

        // Make it executable
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&current_exe)
            .context("Failed to get binary permissions")?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&current_exe, perms)
            .context("Failed to set binary permissions")?;

        // Clean up
        let _ = fs::remove_file(temp_backup);
    }

    #[cfg(windows)]
    {
        let temp_path = current_exe.with_extension(".new");
        fs::copy(&built_binary, &temp_path)
            .context("Failed to copy new binary")?;

        anyhow::bail!(
            "On Windows, please manually replace {:?} with {:?}",
            current_exe,
            built_binary
        );
    }

    // Clean up source directory
    let _ = fs::remove_dir_all(source_dir);

    tracing::info!("Update built from source and installed successfully");

    Ok(())
}

/// Extract a .tar.gz archive to the specified directory.
fn extract_tar_gz(archive_path: &PathBuf, extract_dir: &PathBuf) -> Result<()> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let file = fs::File::open(archive_path)
        .context("Failed to open archive file")?;

    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    archive.unpack(extract_dir)
        .context("Failed to extract archive")?;

    Ok(())
}
