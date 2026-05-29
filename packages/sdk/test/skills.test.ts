import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

const TMP = join(tmpdir(), `sediman-test-skills-${process.pid}`)

beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

describe("skills module", () => {
  test("handleSkillsList returns empty when no skills dir", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const freshDir = join(TMP, "no-skills")
    const { handleSkillsList } = await import("../src/modules/skills.js")
    const result = await handleSkillsList()
    expect(result.skills).toBeInstanceOf(Array)
  })

  test("handleSkillsCreate creates a skill", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSkillsCreate, handleSkillsGet, handleSkillsDelete } = await import("../src/modules/skills.js")

    const skill = await handleSkillsCreate({
      name: "test-skill",
      description: "A test skill",
      steps: ["open browser", "do thing"],
      category: "test",
    })

    expect(skill.name).toBe("test-skill")
    expect(skill.description).toBe("A test skill")
    expect(skill.version).toBe(1)

    const got = await handleSkillsGet({ name: "test-skill" })
    expect(got).not.toBeNull()
    expect(got!.name).toBe("test-skill")

    await handleSkillsDelete({ name: "test-skill" })
    const gone = await handleSkillsGet({ name: "test-skill" })
    expect(gone).toBeNull()
  })

  test("handleSkillsCreate rejects invalid name", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSkillsCreate } = await import("../src/modules/skills.js")
    expect(() => handleSkillsCreate({ name: "BAD NAME!", description: "x", steps: [] })).toThrow()
  })

  test("handleSkillsList returns created skills", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSkillsCreate, handleSkillsList } = await import("../src/modules/skills.js")

    await handleSkillsCreate({ name: "alpha", description: "first", steps: [] })
    await handleSkillsCreate({ name: "beta", description: "second", steps: [] })

    const { skills } = await handleSkillsList()
    expect(skills.length).toBeGreaterThanOrEqual(2)
    const names = skills.map(s => s.name)
    expect(names).toContain("alpha")
    expect(names).toContain("beta")
  })

  test("handleSkillsDelete on non-existent returns empty deleted", async () => {
    process.env.SEDIMAN_DATA_DIR = TMP
    const { handleSkillsDelete } = await import("../src/modules/skills.js")
    const result = await handleSkillsDelete({ name: "no-such-skill" })
    expect(result.deleted).toBe("")
  })
})
