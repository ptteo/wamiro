export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  static badRequest(message = "Invalid request", details?: unknown) {
    return new ApiError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, "unauthorized", message);
  }
  static forbidden(message = "You do not have access to this resource") {
    return new ApiError(403, "forbidden", message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, "not_found", message);
  }
  static conflict(message = "Conflict") {
    return new ApiError(409, "conflict", message);
  }
  static rateLimited(message = "Too many requests. Try again shortly.") {
    return new ApiError(429, "rate_limited", message);
  }
}
