import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, writeFileSync, existsSync, unlinkSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const TMP = join(tmpdir(), `sediman-test-soul-${process.pid}`)

beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

describe("soul module", () => {
  test("loadSoul returns default when no file", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { loadSoul } = await import("../src/soul.js")
    const content = loadSoul()
    expect(content).toContain("Sediman")
    expect(content.length).toBeGreaterThan(0)
  })

  test("saveSoul and loadSoul roundtrip", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { saveSoul, loadSoul } = await import("../src/soul.js")
    saveSoul("custom soul content")
    const content = loadSoul()
    expect(content).toBe("custom soul content")
  })

  test("resetSoul removes file and reverts to default", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { saveSoul, resetSoul, loadSoul } = await import("../src/soul.js")
    saveSoul("temporary")
    resetSoul()
    const content = loadSoul()
    expect(content).toContain("Sediman")
  })
})
