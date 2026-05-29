export const REDIS_PREFIX = {
  SESSION_LOCK: 'lock:session:',
  AUTO_LOCK: 'lock:auto:',
  OOC_PERSISTENT: 'ooc:persistent:',
  OOC_EPHEMERAL: 'ooc:ephemeral:',
  OOC_ACTIVE_CHARS: 'ooc:active_chars:',
  OOC_TEMP_CHARS: 'ooc:temp_chars:',
  STORY_CACHE: 'cache:story:',
  CHAR_CACHE: 'cache:char:',
  USER_CACHE: 'cache:user:',
  EMBED_CACHE: 'cache:embed:',
  MISSION_TRACK_LOCK: 'lock:mission:',
  IDEMPOTENCY: 'idem:',
  RATE_LIMIT: 'rl:',
} as const;

export const REDIS_TTL = {
  STORY_CACHE_SEC: 300,
  CHAR_CACHE_SEC: 300,
  USER_CACHE_SEC: 300,
  EMBED_CACHE_SEC: 86400,
  OOC_EPHEMERAL_SEC: 3600,
  IDEMPOTENCY_SEC: 900,
  LOCK_DEFAULT_MS: 30000,
} as const;

export const UNLOCK_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;
