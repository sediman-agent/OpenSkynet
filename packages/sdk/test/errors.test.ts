import { describe, test, expect } from "bun:test"
import { SedimanError, ConnectionError, TimeoutError, ApiError, NotFoundError, ValidationError, WebSocketError, createApiError } from "../src/errors.js"

describe("SedimanError", () => {
  test("has correct name", () => {
    const err = new SedimanError("test")
    expect(err.name).toBe("SedimanError")
    expect(err.message).toBe("test")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SedimanError)
  })
})

describe("ConnectionError", () => {
  test("stores cause", () => {
    const cause = new Error("network")
    const err = new ConnectionError("failed", cause)
    expect(err.name).toBe("ConnectionError")
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(SedimanError)
  })

  test("cause is optional", () => {
    const err = new ConnectionError("failed")
    expect(err.cause).toBeUndefined()
  })
})

describe("TimeoutError", () => {
  test("default message", () => {
    const err = new TimeoutError()
    expect(err.name).toBe("TimeoutError")
    expect(err.message).toBe("Request timed out")
  })

  test("custom message", () => {
    const err = new TimeoutError("custom")
    expect(err.message).toBe("custom")
  })
})

describe("ApiError", () => {
  test("stores status and detail", () => {
    const err = new ApiError(500, { code: "INTERNAL", message: "oops" })
    expect(err.name).toBe("ApiError")
    expect(err.status).toBe(500)
    expect(err.code).toBe("INTERNAL")
    expect(err.suggestion).toBeUndefined()
  })

  test("stores suggestion", () => {
    const err = new ApiError(422, { code: "INVALID", message: "bad", suggestion: "fix it" })
    expect(err.suggestion).toBe("fix it")
  })
})

describe("NotFoundError", () => {
  test("has 404 status", () => {
    const err = new NotFoundError({ code: "NOT_FOUND", message: "gone" })
    expect(err.name).toBe("NotFoundError")
    expect(err.status).toBe(404)
    expect(err).toBeInstanceOf(ApiError)
  })
})

describe("ValidationError", () => {
  test("has 400 status", () => {
    const err = new ValidationError({ code: "BAD", message: "invalid" })
    expect(err.name).toBe("ValidationError")
    expect(err.status).toBe(400)
    expect(err).toBeInstanceOf(ApiError)
  })
})

describe("WebSocketError", () => {
  test("stores code", () => {
    const err = new WebSocketError("ws fail", 1006)
    expect(err.name).toBe("WebSocketError")
    expect(err.code).toBe(1006)
  })

  test("code is optional", () => {
    const err = new WebSocketError("ws fail")
    expect(err.code).toBeUndefined()
  })
})

describe("createApiError", () => {
  test("400 → ValidationError", () => {
    const err = createApiError(400, { code: "BAD", message: "nope" })
    expect(err).toBeInstanceOf(ValidationError)
  })

  test("404 → NotFoundError", () => {
    const err = createApiError(404, { code: "MISSING", message: "nope" })
    expect(err).toBeInstanceOf(NotFoundError)
  })

  test("500 → ApiError", () => {
    const err = createApiError(500, { code: "INTERNAL", message: "boom" })
    expect(err).toBeInstanceOf(ApiError)
    expect(err).not.toBeInstanceOf(NotFoundError)
    expect(err).not.toBeInstanceOf(ValidationError)
  })
})
