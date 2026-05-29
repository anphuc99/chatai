export class ErrorResponseDto {
  error!: ErrorDetails;
}

export class ErrorDetails {
  code!: string;
  message!: string;
  details?: unknown;
}
