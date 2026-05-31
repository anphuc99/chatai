import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message?: string, status?: HttpStatus, details?: unknown) {
    const meta = getMeta(code);
    super(
      { code, message: message ?? meta.defaultMessage, details },
      status ?? meta.status,
    );
    this.code = code;
    this.details = details;
  }
}

interface ErrorMeta {
  status: HttpStatus;
  defaultMessage: string;
}

const REGISTRY = {
  INVALID_TOKEN: { status: HttpStatus.UNAUTHORIZED, defaultMessage: 'Token không hợp lệ' },
  USER_DISABLED: { status: HttpStatus.FORBIDDEN, defaultMessage: 'Tài khoản đã bị vô hiệu hoá' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, defaultMessage: 'Không tìm thấy' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, defaultMessage: 'Không có quyền truy cập' },
  INVALID_PAYLOAD: { status: HttpStatus.BAD_REQUEST, defaultMessage: 'Dữ liệu không hợp lệ' },
  SESSION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    defaultMessage: 'Phiên hội thoại không tồn tại',
  },
  SESSION_LOCKED: { status: HttpStatus.CONFLICT, defaultMessage: 'Phiên đang được xử lý' },
  SESSION_ALREADY_ENDED: { status: HttpStatus.CONFLICT, defaultMessage: 'Phiên đã kết thúc' },
  STORY_HAS_ACTIVE_SESSION: {
    status: HttpStatus.CONFLICT,
    defaultMessage: 'Story đang có phiên active',
  },
  RATE_LIMIT: { status: HttpStatus.TOO_MANY_REQUESTS, defaultMessage: 'Quá nhiều request' },
  LLM_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    defaultMessage: 'LLM tạm không khả dụng',
  },
  LLM_TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    defaultMessage: 'LLM phản hồi quá thời gian quy định',
  },
  TTS_ENGINE_DOWN: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    defaultMessage: 'TTS engine tạm không khả dụng',
  },
  REFERENCE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    defaultMessage: 'Voice reference không tồn tại',
  },
  NOT_ENOUGH_GEMS: { status: HttpStatus.PAYMENT_REQUIRED, defaultMessage: 'Số dư gem không đủ' },
  ITEM_NOT_FOUND: { status: HttpStatus.NOT_FOUND, defaultMessage: 'Vật phẩm không tồn tại' },
  ITEM_INACTIVE: { status: HttpStatus.GONE, defaultMessage: 'Vật phẩm đã ngừng bán' },
  MISSION_NOT_CLAIMABLE: {
    status: HttpStatus.CONFLICT,
    defaultMessage: 'Nhiệm vụ chưa thể claim',
  },
  NO_WORDS_DUE: { status: HttpStatus.BAD_REQUEST, defaultMessage: 'Chưa có từ nào đến hạn ôn' },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    defaultMessage: 'Idempotency-Key trùng với request khác',
  },
  LLM_PARSE_FAIL: {
    status: HttpStatus.BAD_GATEWAY,
    defaultMessage: 'LLM trả về dữ liệu không parse được',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    defaultMessage: 'Lỗi máy chủ',
  },
} satisfies Record<string, ErrorMeta>;

export function getMeta(code: string): ErrorMeta {
  const meta = (REGISTRY as Record<string, ErrorMeta>)[code];
  if (!meta) {
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, defaultMessage: 'Unknown error' };
  }
  return meta;
}

export const ERR = Object.fromEntries(
  Object.keys(REGISTRY).map((k) => [k, k]),
) as { readonly [K in keyof typeof REGISTRY]: K };
