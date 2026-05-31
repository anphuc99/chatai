import { SessionSummaryDto } from './session-summary.dto';
import { JournalMessageDto } from '@chatai/shared-types';

export class SessionDetailDto extends SessionSummaryDto {
  messages!: JournalMessageDto[];
}
