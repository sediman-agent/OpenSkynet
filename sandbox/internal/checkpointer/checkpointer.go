// Package checkpointer provides filesystem checkpoint functionality
// using directory copies for snapshot and restore.
package checkpointer

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/sediman/sandbox/pkg/api"
)

type fsCheckpointer struct {
	dataDir string
}

// New creates a new filesystem-based checkpointer.
func New(dataDir string) api.Checkpointer {
	return &fsCheckpointer{dataDir: dataDir}
}

func (c *fsCheckpointer) Create(dir string, name string) (*api.CheckpointInfo, error) {
	id := fmt.Sprintf("cp-%d", time.Now().UnixNano())
	cpDir := filepath.Join(c.dataDir, "checkpoints", id)

	if err := os.MkdirAll(cpDir, 0755); err != nil {
		return nil, fmt.Errorf("create checkpoint dir: %w", err)
	}

	if err := copyDir(dir, cpDir); err != nil {
		os.RemoveAll(cpDir)
		return nil, fmt.Errorf("copy to checkpoint: %w", err)
	}

	info := &api.CheckpointInfo{
		ID:        id,
		Name:      name,
		CreatedAt: time.Now(),
		Path:      cpDir,
	}
	return info, nil
}

func (c *fsCheckpointer) Revert(dir string, id string) error {
	cpDir := filepath.Join(c.dataDir, "checkpoints", id)
	if _, err := os.Stat(cpDir); err != nil {
		return fmt.Errorf("checkpoint not found: %s", id)
	}

	// Clear target and copy checkpoint back
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("clear target dir: %w", err)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("recreate target dir: %w", err)
	}
	return copyDir(cpDir, dir)
}

func (c *fsCheckpointer) Commit(dir string, id string) error {
	// Commit is a no-op for the copy-based implementation:
	// the current state is already in the working directory.
	return nil
}

func (c *fsCheckpointer) List(dir string) ([]*api.CheckpointInfo, error) {
	cpBase := filepath.Join(c.dataDir, "checkpoints")
	entries, err := os.ReadDir(cpBase)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var result []*api.CheckpointInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info := &api.CheckpointInfo{
			ID:   entry.Name(),
			Path: filepath.Join(cpBase, entry.Name()),
		}
		if fi, err := entry.Info(); err == nil {
			info.CreatedAt = fi.ModTime()
		}
		result = append(result, info)
	}
	return result, nil
}

func (c *fsCheckpointer) Delete(dir string, id string) error {
	cpDir := filepath.Join(c.dataDir, "checkpoints", id)
	return os.RemoveAll(cpDir)
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}

		if !info.Mode().IsRegular() {
			return nil
		}

		return copyFile(path, target, info.Mode())
	})
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
