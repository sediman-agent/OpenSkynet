/**
 * Network Error Types
 */

export class NetworkError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
    this.code = 'NETWORK_ERROR';
  }
}

export class APIError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'APIError';
    this.code = 'API_ERROR';
  }
}
