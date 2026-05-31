import { SessionSummaryDto } from './session-summary.dto';

export class MessageDto {
  id!: string;
  role!: string;
  characterId?: string | null;
  characterName?: string | null;
  text!: string;
  translation?: string | null;
  emotion?: string | null;
  intensity?: string | null;
  words?: any;
  shopEvent?: any;
  turnOrder!: number;
  timestamp!: number;
}

export class SessionDetailDto extends SessionSummaryDto {
  messages!: MessageDto[];
}
