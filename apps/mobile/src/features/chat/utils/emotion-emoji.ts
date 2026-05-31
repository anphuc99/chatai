export type Emotion =
  | 'Angry'
  | 'Shouting'
  | 'Disgusted'
  | 'Sad'
  | 'Scared'
  | 'Surprised'
  | 'Shy'
  | 'Affectionate'
  | 'Happy'
  | 'Excited'
  | 'Serious'
  | 'Neutral';

const EMOTION_EMOJI: Record<Emotion, string> = {
  Angry: '😠',
  Shouting: '😡',
  Disgusted: '🤢',
  Sad: '😢',
  Scared: '😨',
  Surprised: '😲',
  Shy: '😳',
  Affectionate: '🥰',
  Happy: '😊',
  Excited: '🤩',
  Serious: '😐',
  Neutral: '🙂',
};

/**
 * Trả về emoji tương ứng với emotion, mặc định là '🙂' (Neutral)
 */
export function emojiFor(emotion?: string | null): string {
  if (!emotion) return '🙂';
  return EMOTION_EMOJI[emotion as Emotion] ?? '🙂';
}
