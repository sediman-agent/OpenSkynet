import { describe, test, expect } from "bun:test"
import { register, registerAll, isRegistered, dispatch } from "../src/transport.js"

describe("transport", () => {
  test("register and isRegistered", () => {
    register("test.method", async () => "hello")
    expect(isRegistered("test.method")).toBe(true)
    expect(isRegistered("nonexistent")).toBe(false)
  })

  test("registerAll registers multiple handlers", () => {
    registerAll({
      "batch.a": async () => "a",
      "batch.b": async () => "b",
    })
    expect(isRegistered("batch.a")).toBe(true)
    expect(isRegistered("batch.b")).toBe(true)
  })

  test("dispatch calls registered handler", async () => {
    register("test.echo", async (params) => ({ echo: params.value }))
    const responses: string[] = []
    const writer = (data: string) => responses.push(data)
    const notify = async () => {}

    await dispatch("test.echo", { value: 42 }, 1, notify, writer)
    expect(responses.length).toBe(1)
    const msg = JSON.parse(responses[0])
    expect(msg.result.echo).toBe(42)
    expect(msg.id).toBe(1)
  })

  test("dispatch includes id in response", async () => {
    register("test.idcheck", async () => ({ ok: true }))
    const responses: string[] = []
    const writer = (data: string) => responses.push(data)
    const notify = async () => {}

    await dispatch("test.idcheck", {}, "abc-123", notify, writer)
    const msg = JSON.parse(responses[0])
    expect(msg.id).toBe("abc-123")
  })

  test("dispatch returns error for handler exception", async () => {
    register("test.fail", async () => { throw new Error("boom") })
    const responses: string[] = []
    const writer = (data: string) => responses.push(data)
    const notify = async () => {}

    await dispatch("test.fail", {}, 99, notify, writer)
    const msg = JSON.parse(responses[0])
    expect(msg.error).toBeDefined()
    expect(msg.error.message).toBe("boom")
    expect(msg.id).toBe(99)
  })
})
