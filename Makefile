.PHONY: build-tui build-release clean-tui test-tui
.PHONY: build-sandbox test-sandbox clean-sandbox install-sandbox

# ── Rust TUI ────────────────────────────────────────────────────

# Build the Rust TUI (debug)
build-tui:
	cargo build -p sediman-tui

# Build the Rust TUI (release)
build-release:
	cargo build --release -p sediman-tui

# Run tests
test-tui:
	cargo test --workspace -- --test-threads=1

# Clean Rust artifacts
clean-tui:
	cargo clean

# Build and install the TUI binary to ~/.cargo/bin
install-tui: build-release
	cp target/release/sediman-tui ~/.cargo/bin/
	@echo "Installed to ~/.cargo/bin/sediman-tui"

# ── Go Sandbox ──────────────────────────────────────────────────

SANDBOX_BIN ?= sediman-sandbox
SANDBOX_DIR ?= sandbox

# Build the sandbox binary
build-sandbox:
	cd $(SANDBOX_DIR) && go build -o $(SANDBOX_BIN) ./cmd/sediman-sandbox

# Run sandbox tests
test-sandbox:
	cd $(SANDBOX_DIR) && go test -v -count=1 ./...

# Run sandbox tests with race detection
test-sandbox-race:
	cd $(SANDBOX_DIR) && go test -race -count=1 ./...

# Clean sandbox build artifacts
clean-sandbox:
	rm -f $(SANDBOX_DIR)/$(SANDBOX_BIN)
	rm -rf $(SANDBOX_DIR)/sediman-sandbox

# Build and install sandbox to ~/.local/bin
install-sandbox: build-sandbox
	cp $(SANDBOX_DIR)/$(SANDBOX_BIN) ~/.local/bin/
	@echo "Installed to ~/.local/bin/$(SANDBOX_BIN)"
