//go:build linux

package sandbox

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/sediman/sandbox/internal/checkpointer"
	"github.com/sediman/sandbox/pkg/api"
)

// linuxSandbox implements api.Sandbox for Linux using bubblewrap + cgroups.
type linuxSandbox struct {
	dataDir string
}

func newSandbox(dataDir string) api.Sandbox {
	return &linuxSandbox{dataDir: dataDir}
}

func newCheckpointer(dataDir string) api.Checkpointer {
	return checkpointer.New(dataDir)
}

func (s *linuxSandbox) Run(ctx context.Context, cmd api.Command, policy api.Policy) (*api.Result, error) {
	bwrapPath, err := exec.LookPath("bwrap")
	if err != nil {
		return nil, fmt.Errorf("bubblewrap (bwrap) not found: %w", err)
	}

	// Build bwrap args
	args := []string{
		bwrapPath,
		"--die-with-parent",
		"--unshare-all",
		"--proc", "/proc",
		"--dev", "/dev",
		"--tmpfs", "/tmp",
		"--ro-bind", "/usr", "/usr",
		"--ro-bind", "/lib", "/lib",
		"--ro-bind", "/lib64", "/lib64",
		"--ro-bind", "/bin", "/bin",
		"--ro-bind", "/sbin", "/sbin",
		"--ro-bind", "/etc", "/etc",
	}

	// Bind allowed dirs
	for _, dir := range policy.AllowDirs {
		abs, _ := filepath.Abs(dir)
		args = append(args, "--bind", abs, abs)
	}

	// Working dir
	if cmd.WorkingDir != "" {
		args = append(args, "--chdir", cmd.WorkingDir)
	}

	// Set env
	for k, v := range cmd.Env {
		args = append(args, "--setenv", k, v)
	}

	// Memory limit via cgroups (if configured)
	if policy.MaxMemoryMB > 0 {
		memStr := fmt.Sprintf("%dM", policy.MaxMemoryMB)
		args = append(args, "--setenv", "MEMORY_LIMIT", memStr)
	}

	// Append the command to run
	args = append(args, cmd.Args...)

	// Timeout context
	if policy.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, policy.Timeout)
		defer cancel()
	}

	command := exec.CommandContext(ctx, args[0], args[1:]...)
	
	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	
	if len(cmd.Stdin) > 0 {
		command.Stdin = bytes.NewReader(cmd.Stdin)
	}

	start := time.Now()
	err = command.Run()
	duration := time.Since(start)

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
			if ctx.Err() == context.DeadlineExceeded {
				exitCode = 124
			}
		} else {
			return nil, fmt.Errorf("sandbox run: %w", err)
		}
	}

	return &api.Result{
		ExitCode: exitCode,
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		Duration: duration,
	}, nil
}

func (s *linuxSandbox) Close() error {
	return nil
}
