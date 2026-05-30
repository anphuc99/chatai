import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FirebaseAdminProvider } from './firebase-admin.provider';

@Module({
  controllers: [AuthController],
  providers: [AuthService, FirebaseAdminProvider],
  exports: [AuthService, FirebaseAdminProvider],
})
export class AuthModule {}
