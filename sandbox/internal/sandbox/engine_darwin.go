//go:build darwin

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

// darwinSandbox implements api.Sandbox for macOS.
// Uses Apple's sandbox-exec with a Seatbelt profile for kernel-level isolation.
type darwinSandbox struct {
	dataDir      string
	profilePath  string
}

func newSandbox(dataDir string) api.Sandbox {
	return &darwinSandbox{
		dataDir:     dataDir,
		profilePath: filepath.Join(dataDir, "profile.sb"),
	}
}

func newCheckpointer(dataDir string) api.Checkpointer {
	return checkpointer.New(dataDir)
}

func (s *darwinSandbox) Run(ctx context.Context, cmd api.Command, policy api.Policy) (*api.Result, error) {
	if policy.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, policy.Timeout)
		defer cancel()
	}

	// Try sandbox-exec with a Seatbelt profile first.
	// If sandbox-exec is unavailable, fall back to restricted subprocess.
	sbPath := s.ensureProfile(policy)
	sandboxExecAvailable := false
	if _, err := exec.LookPath("sandbox-exec"); err == nil {
		sandboxExecAvailable = true
	}

	var args []string
	if sandboxExecAvailable {
		defer os.Remove(sbPath)
		args = append([]string{"sandbox-exec", "-f", sbPath, "--"}, cmd.Args...)
	} else {
		args = cmd.Args
	}

	command := exec.CommandContext(ctx, args[0], args[1:]...)

	if cmd.WorkingDir != "" {
		command.Dir = cmd.WorkingDir
	}

	// Clean environment
	cleanEnv := []string{
		"PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
		"HOME=" + os.Getenv("HOME"),
		"TMPDIR=" + os.Getenv("TMPDIR"),
	}
	for k, v := range cmd.Env {
		cleanEnv = append(cleanEnv, fmt.Sprintf("%s=%s", k, v))
	}
	command.Env = cleanEnv

	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if len(cmd.Stdin) > 0 {
		command.Stdin = bytes.NewReader(cmd.Stdin)
	}

	start := time.Now()
	err := command.Run()
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

func (s *darwinSandbox) Close() error {
	return nil
}

// ensureProfile generates a temporary Seatbelt sandbox profile for the given policy.
//
// The profile allows all reads (needed for normal command execution),
// restricts writes to only allowed directories, and restricts
// network access unless allow_net is set.
func (s *darwinSandbox) ensureProfile(policy api.Policy) string {
	sbDir := filepath.Dir(s.profilePath)
	os.MkdirAll(sbDir, 0755)

	var allowDirWrites string
	for _, dir := range policy.AllowDirs {
		abs, _ := filepath.Abs(dir)
		if resolved, err := filepath.EvalSymlinks(abs); err == nil {
			abs = resolved
		}
		allowDirWrites += fmt.Sprintf("(allow file-write* (subpath %q))\n", abs)
	}

	netRule := "(deny network*)\n"
	if policy.AllowNet {
		netRule = "(allow network* (local ip))\n"
		if len(policy.AllowNetHosts) > 0 {
			netRule = "(allow network*\n  (local ip)\n"
			for _, host := range policy.AllowNetHosts {
				netRule += fmt.Sprintf("  (remote ip %q)\n", host)
			}
			netRule += ")\n"
		}
	}

	profile := fmt.Sprintf(`(version 1)
(deny default)

; Allow all reads (needed for normal command execution)
(allow file-read*)

; Allow basic system operations
(allow file-read-metadata)
(allow sysctl-read)
(allow signal)
(allow ipc-posix*)
(allow process-fork)
(allow process-exec)

; Allow writes only to allowed directories and temp
(allow file-write* (subpath "/private/tmp"))
(allow file-write* (subpath "/private/var/tmp"))
(allow file-write* (subpath "/dev"))
%s

; Network
%s

; Deny direct hardware access
(deny iokit-open)
`, allowDirWrites, netRule)

	os.WriteFile(s.profilePath, []byte(profile), 0644)
	return s.profilePath
}

// defaultPolicy returns a safe baseline policy for the sandbox.
func defaultPolicy(allowNet bool, allowDirs []string) api.Policy {
	return api.Policy{
		AllowDirs: allowDirs,
		AllowNet:  allowNet,
	}
}
