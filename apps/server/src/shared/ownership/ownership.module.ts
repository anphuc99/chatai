import { Module, Global } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class OwnershipModule {}
