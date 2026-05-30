export const EMOTIONS = [
  'Angry',
  'Shouting',
  'Disgusted',
  'Sad',
  'Scared',
  'Surprised',
  'Shy',
  'Affectionate',
  'Happy',
  'Excited',
  'Serious',
  'Neutral',
] as const;

export const INTENSITIES = ['low', 'medium', 'high'] as const;

export type Emotion = (typeof EMOTIONS)[number];
export type Intensity = (typeof INTENSITIES)[number];
