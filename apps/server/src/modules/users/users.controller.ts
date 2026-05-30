import { Controller, Get, Patch, Post, Body, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { UserDto } from '@chatai/shared-types';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UploadedFileFastify, FastifyFile } from './decorators/uploaded-file.decorator';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.usersService.getProfile(user.uid);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserDto> {
    return this.usersService.updatePreferences(user.uid, dto);
  }

  @Post('avatar')
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFileFastify() file: FastifyFile | null,
  ): Promise<{ photoURL: string }> {
    if (!file) {
      throw new Error('Không nhận được file upload');
    }
    return this.usersService.uploadAvatar(user.uid, file);
  }
}
