export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor?: string;
};

export type Result<T, E = ErrorResponse> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type Timestamp = number; // epoch ms
export type ISODate = string;
