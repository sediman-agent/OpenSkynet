import type { ApiErrorDetail } from "./types.js"

export class SedimanError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "SedimanError"
  }
}

export class ConnectionError extends SedimanError {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.cause = cause
    this.name = "ConnectionError"
  }
}

export class TimeoutError extends SedimanError {
  constructor(message = "Request timed out") {
    super(message)
    this.name = "TimeoutError"
  }
}

export class ApiError extends SedimanError {
  readonly status: number
  readonly code: string
  readonly suggestion: string | undefined
  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message)
    this.status = status
    this.name = "ApiError"
    this.code = detail.code
    this.suggestion = detail.suggestion
  }
}

export class NotFoundError extends ApiError {
  constructor(detail: ApiErrorDetail) {
    super(404, detail)
    this.name = "NotFoundError"
  }
}

export class ValidationError extends ApiError {
  constructor(detail: ApiErrorDetail) {
    super(400, detail)
    this.name = "ValidationError"
  }
}

export class WebSocketError extends SedimanError {
  readonly code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.code = code
    this.name = "WebSocketError"
  }
}

export function createApiError(status: number, detail: ApiErrorDetail): ApiError {
  switch (status) {
    case 400: return new ValidationError(detail)
    case 404: return new NotFoundError(detail)
    default: return new ApiError(status, detail)
  }
}
