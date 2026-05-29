import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

describe("config", () => {
  test("exports DATA_DIR as string", async () => {
    const mod = await import("../src/config.js")
    expect(typeof mod.DATA_DIR).toBe("string")
    expect(mod.DATA_DIR.length).toBeGreaterThan(0)
  })

  test("exports all path constants", async () => {
    const mod = await import("../src/config.js")
    for (const key of ["SKILLS_DIR", "MEMORY_DIR", "SESSIONS_DIR", "CRON_DIR", "SOUL_FILE"]) {
      expect(typeof (mod as Record<string, unknown>)[key]).toBe("string")
    }
  })

  test("exports numeric limits", async () => {
    const mod = await import("../src/config.js")
    expect(typeof mod.MEMORY_LIMIT).toBe("number")
    expect(mod.MEMORY_LIMIT).toBeGreaterThan(0)
    expect(typeof mod.MAX_TASK_LENGTH).toBe("number")
  })
})
