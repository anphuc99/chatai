import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleSigninDto } from './dto/google-signin.dto';
import { UserDto } from './dto/user-response.dto';
import { Public } from '../../shared/decorators/public.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('google-signin')
  async googleSignin(@Body() dto: GoogleSigninDto): Promise<UserDto> {
    const decoded = await this.authService.verifyIdToken(dto.idToken);
    const user = await this.authService.upsertUser(decoded);
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.authService.invalidateSession(user.uid);
  }
}
