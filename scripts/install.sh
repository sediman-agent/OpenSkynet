#!/usr/bin/env bash
# Sediman installer — https://sediman.ai
#
# Usage:
#   curl -fsSL https://get.sediman.ai | bash
#   or
#   curl -fsSL https://get.sediman.ai | bash -s -- --skip-browser
#
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[32m'
RED='\033[31m'
CYAN='\033[36m'
DIM='\033[2m'
RESET='\033[0m'

TERMINATOR_BIN_DIR="$HOME/.terminator/bin"
SKIP_BROWSER=false
FORCE=false
FROM_SOURCE=false
GIT_BRANCH="main"
GITHUB_REPO="sediman-agent/OpenSkynet"

for arg in "$@"; do
    case "$arg" in
        --skip-browser) SKIP_BROWSER=true ;;
        --force) FORCE=true ;;
        --from-source) FROM_SOURCE=true ;;
        --branch)
            GIT_BRANCH="$2"
            shift
            ;;
        --branch=*)
            GIT_BRANCH="${arg#*=}"
            ;;
        --help|-h)
            echo "Usage: curl -fsSL https://get.sediman.ai | bash -s -- [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-browser   Skip Playwright/CloakBrowser install"
            echo "  --force          Reinstall even if already installed"
            echo "  --from-source    Install from local cloned repo (skip GitHub)"
            echo "  --branch BRANCH  Install a specific branch (default: main)"
            echo "  --help           Show this help"
            exit 0
            ;;
    esac
done

info()  { echo -e "  ${GREEN}+${RESET} $*"; }
warn()  { echo -e "  ${CYAN}!${RESET} $*"; }
error() { echo -e "  ${RED}X${RESET} $*" >&2; }

detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        darwin) os="macos" ;;
        linux)  os="linux" ;;
        *)
            error "Unsupported OS: $os. Sediman requires macOS or Linux."
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64|amd64)   arch="x86_64" ;;
        aarch64|arm64)  arch="aarch64" ;;
        *)
            error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    echo "${arch}-${os}"
}

command_exists() {
    command -v "$1" &>/dev/null
}

install_uv() {
    if command_exists uv && [ "$FORCE" != "true" ]; then
        info "uv already installed $(uv --version 2>/dev/null || true)"
        return 0
    fi

    info "Installing uv (Python package manager)..."
    curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null

    if ! command_exists uv; then
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi

    if ! command_exists uv; then
        error "Failed to install uv. Please install manually: https://docs.astral.sh/uv/"
        exit 1
    fi

    info "uv installed $(uv --version)"
}

ensure_uv_in_path() {
    local uv_path
    uv_path="$(command -v uv 2>/dev/null || true)"
    if [ -z "$uv_path" ]; then
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi
}

install_sediman() {
    local latest_version
    latest_version="$(curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/pyproject.toml" 2>/dev/null | grep '^version = "' | head -1 | sed -E 's/version = "([^"]+)"/\1/' || true)"

    if command_exists sediman && [ "$FORCE" != "true" ]; then
        local current_version
        current_version="$(sediman --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
        info "Sediman already installed: $current_version"

        if [ -n "$latest_version" ] && [ -n "$current_version" ] && [ "$current_version" != "$latest_version" ]; then
            warn "Newer version available: $latest_version (you have $current_version)"
            info "Reinstalling..."
            FORCE=true
        else
            info "Use --force to reinstall, or 'sediman --version' to check."
            return 0
        fi
    fi

    if [ "$FROM_SOURCE" = "true" ]; then
        info "Installing sediman from local source..."
        if [ ! -f "pyproject.toml" ]; then
            error "pyproject.toml not found. Run this from the sediman source directory."
            error "Or clone first: git clone https://github.com/${GITHUB_REPO}.git"
            exit 1
        fi
        uv tool install --force .
        return 0
    fi

    local install_source="git+https://github.com/${GITHUB_REPO}.git"

    # Get latest release tag for version-specific installation
    local latest_tag
    latest_tag="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/' || true)"

    if [ -n "$latest_tag" ] && [ "$GIT_BRANCH" = "main" ]; then
        # Install from latest release tag instead of main branch
        install_source="git+https://github.com/${GITHUB_REPO}.git@${latest_tag}"
        info "Installing sediman ${latest_tag} from GitHub..."
    elif [ "$GIT_BRANCH" != "main" ]; then
        install_source="${install_source}@${GIT_BRANCH}"
        info "Installing sediman from branch ${GIT_BRANCH}..."
    else
        info "Installing sediman from main branch..."
    fi

    uv tool install "$install_source" --force 2>/dev/null || {
        error "Failed to install sediman via GitHub."
        error "Try manually: uv tool install $install_source"
        error "Or install from source: clone the repo and run 'uv tool install --force .'"
        exit 1
    }

    if ! command_exists sediman; then
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi

    if ! command_exists sediman; then
        warn "sediman not found in PATH. You may need to restart your shell."
        warn "Or add ~/.local/bin to your PATH."
    fi

    info "Sediman installed: $(sediman --version 2>/dev/null | head -1 || echo 'unknown')"
}

download_tui_binary() {
    local platform="$1"
    local tui_bin="$TERMINATOR_BIN_DIR/terminator"

    if [ -x "$tui_bin" ] && [ "$FORCE" != "true" ]; then
        info "terminator TUI already installed at $tui_bin"
        return 0
    fi

    local latest_tag
    latest_tag="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name":[[:space:]]*"([^"]+)".*/\1/' || true)"

    if [ -z "$latest_tag" ]; then
        warn "Could not determine latest release. Skipping TUI binary."
        warn "You can build it from source: cargo build -p sediman-tui"
        return 0
    fi

    local archive_name="sediman-${latest_tag}-${platform}.tar.gz"
    local download_url="https://github.com/${GITHUB_REPO}/releases/download/${latest_tag}/${archive_name}"

    info "Downloading terminator TUI ${latest_tag} for ${platform}..."

    mkdir -p "$TERMINATOR_BIN_DIR"

    local tmp_dir
    tmp_dir="$(mktemp -d)"

    cleanup_tmp() { rm -rf "${tmp_dir:-}" 2>/dev/null || true; }
    trap cleanup_tmp RETURN

    if ! curl -fsSL "$download_url" -o "$tmp_dir/$archive_name" 2>/dev/null; then
        trap - RETURN
        cleanup_tmp
        warn "Pre-built TUI binary not available for ${platform}. Building from source..."

        # Clone repo and build from source
        local source_dir
        source_dir="$(mktemp -d)"

        cleanup_source() { rm -rf "${source_dir:-}" 2>/dev/null || true; }
        trap cleanup_source RETURN

        info "Cloning ${GITHUB_REPO} (branch: ${GIT_BRANCH})..."
        git clone --depth 1 --branch "$GIT_BRANCH" "https://github.com/${GITHUB_REPO}.git" "$source_dir" 2>/dev/null || {
            error "Failed to clone repository"
            return 1
        }

        info "Building TUI from source (this may take a few minutes)..."
        cd "$source_dir"

        # Check if cargo is available
        if ! command_exists cargo; then
            info "Installing Rust (via rustup)..."
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
            export PATH="$HOME/.cargo/bin:$PATH"
        fi

        # Build TUI in release mode
        if cargo build --release --package sediman-tui 2>&1 | tail -5; then
            # Find the built binary
            local built_bin=""
            for candidate in target/release/terminator target/release/sediman-tui; do
                if [ -f "$candidate" ]; then
                    built_bin="$candidate"
                    break
                fi
            done

            if [ -n "$built_bin" ]; then
                mkdir -p "$TERMINATOR_BIN_DIR"
                cp "$built_bin" "$tui_bin"
                chmod +x "$tui_bin"

                # Re-sign the binary on macOS to avoid it being killed
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    codesign --force --deep --sign - "$tui_bin" 2>/dev/null || true
                fi

                info "TUI built and installed to $tui_bin"
                cleanup_source
                return 0
            else
                error "Build succeeded but binary not found"
            fi
        else
            error "Build failed"
        fi

        cleanup_source
        return 1
    fi

    tar xzf "$tmp_dir/$archive_name" -C "$tmp_dir" 2>/dev/null || true

    local found_bin=""
    for candidate in terminator bin/terminator sediman-tui bin/sediman-tui; do
        if [ -f "$tmp_dir/$candidate" ]; then
            found_bin="$tmp_dir/$candidate"
            break
        fi
    done

    if [ -z "$found_bin" ]; then
        trap - RETURN
        cleanup_tmp
        warn "TUI binary not found in archive. Skipping."
        return 0
    fi

    cp "$found_bin" "$tui_bin"
    trap - RETURN
    cleanup_tmp

    chmod +x "$tui_bin"

    # Re-sign the binary on macOS to avoid it being killed
    if [[ "$OSTYPE" == "darwin"* ]]; then
        codesign --force --deep --sign - "$tui_bin" 2>/dev/null || true
    fi

    info "terminator TUI installed to $tui_bin"
}

install_browser() {
    if [ "$SKIP_BROWSER" = "true" ]; then
        info "Skipping browser install (--skip-browser)"
        return 0
    fi

    info "Installing Playwright Chromium..."
    if python3 -m playwright install chromium 2>/dev/null; then
        info "Playwright Chromium installed"
    elif uv run playwright install chromium 2>/dev/null; then
        info "Playwright Chromium installed (via uv)"
    else
        warn "Could not install Playwright Chromium automatically."
        warn "Run 'sediman init' after installation to set up the browser."
    fi

    info "Installing CloakBrowser..."
    if python3 -m cloakbrowser install 2>/dev/null; then
        info "CloakBrowser installed"
    elif uv run python -m cloakbrowser install 2>/dev/null; then
        info "CloakBrowser installed (via uv)"
    else
        warn "Could not install CloakBrowser automatically."
        warn "Run 'sediman init' after installation."
    fi
}

add_to_path() {
    local shell_rc="$HOME/.zshrc"
    local shell_name="${SHELL##*/}"

    if [ "$shell_name" = "bash" ]; then
        shell_rc="$HOME/.bashrc"
    fi

    local path_line="export PATH=\"$TERMINATOR_BIN_DIR:\$PATH\""

    if [ -f "$shell_rc" ] && grep -qF "$TERMINATOR_BIN_DIR" "$shell_rc" 2>/dev/null; then
        return 0
    fi

    echo "" >> "$shell_rc"
    echo "# Added by OpenSkynet installer" >> "$shell_rc"
    echo "$path_line" >> "$shell_rc"

    info "Added $TERMINATOR_BIN_DIR to PATH in $shell_rc"
}

main() {
    echo ""
    echo -e "  ${BOLD}Sediman Installer${RESET}"
    echo -e "  ${DIM}https://sediman.ai${RESET}"
    echo ""

    local platform
    platform="$(detect_platform)"
    info "Detected platform: $platform"

    if [ -d "$HOME/.sediman" ]; then
        warn "Legacy data found at ~/.sediman/ (old installation)."
        warn "Your data now lives at ~/.terminator/. You can:"
        warn "  Run: mv ~/.sediman ~/.terminator    (migrate)"
        warn "  Run: rm -rf ~/.sediman              (delete)"
        echo ""
    fi

    ensure_uv_in_path
    install_uv
    install_sediman

    if [ "$FORCE" = "true" ] || [ ! -x "$TERMINATOR_BIN_DIR/terminator" ]; then
        download_tui_binary "$platform"
        add_to_path
    fi

    install_browser

    echo ""
    echo -e "  ${BOLD}${GREEN}Installation complete!${RESET}"
    echo ""
    echo -e "  ${DIM}Next steps:${RESET}"
    echo -e "  1. Run ${CYAN}terminator${RESET} to launch the TUI"
    echo -e "  2. Or run ${CYAN}sediman run \"your task\"${RESET} for CLI"
    echo ""

    if [ ! -x "$TERMINATOR_BIN_DIR/terminator" ]; then
        echo -e "  ${DIM}For the TUI, build from source:${RESET}"
        echo -e "  ${CYAN}cargo build --release -p sediman-tui${RESET}"
        echo ""
    fi

    info "Restart your shell or run: source ~/.zshrc (or ~/.bashrc)"
    echo ""
}

main "$@"
