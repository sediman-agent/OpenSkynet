import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const TMP = join(tmpdir(), `sediman-test-sessions-${process.pid}`)

beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

describe("sessions module", () => {
  test("handleSessionsList returns empty when no sessions", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSessionsList } = await import("../src/modules/sessions.js")
    const result = await handleSessionsList()
    expect(result.sessions).toBeInstanceOf(Array)
    expect(result.sessions.length).toBe(0)
  })

  test("handleSessionSave creates a session", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSessionSave, handleSessionsList } = await import("../src/modules/sessions.js")

    const result = await handleSessionSave({
      task: "test task",
      steps: [{ action: "click", detail: "button" }],
      result: "done",
    })

    expect(result.session_id).toBeDefined()
    expect(result.session_id.length).toBeGreaterThan(0)

    const { sessions } = await handleSessionsList()
    expect(sessions.length).toBe(1)
    expect(sessions[0].task).toBe("test task")
  })

  test("handleSessionSave without optional fields", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSessionSave } = await import("../src/modules/sessions.js")

    const result = await handleSessionSave({ task: "minimal" })
    expect(result.session_id).toBeDefined()
  })
})
