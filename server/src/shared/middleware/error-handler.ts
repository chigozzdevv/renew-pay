import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { HttpError } from "@/shared/errors/http-error";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new HttpError(404, `Route ${request.method} ${request.originalUrl} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  console.error(error);

  response.status(500).json({
    success: false,
    message: "An unexpected error occurred.",
  });
};
