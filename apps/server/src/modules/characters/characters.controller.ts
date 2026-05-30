import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CharactersService } from './characters.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { CharacterDto } from '@chatai/shared-types';
import { UploadedFileFastify, FastifyFile } from '../users/decorators/uploaded-file.decorator';
import { AppException, ERR } from '../../shared/errors/app-exception';

@Controller()
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get('stories/:storyId/characters')
  async listByStory(
    @CurrentUser() user: AuthUser,
    @Param('storyId') storyId: string,
  ): Promise<CharacterDto[]> {
    return this.charactersService.listByStory(user.uid, storyId);
  }

  @Post('stories/:storyId/characters')
  async create(
    @CurrentUser() user: AuthUser,
    @Param('storyId') storyId: string,
    @Body() dto: CreateCharacterDto,
  ): Promise<CharacterDto> {
    return this.charactersService.create(user.uid, storyId, dto);
  }

  @Patch('characters/:id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCharacterDto,
  ): Promise<CharacterDto> {
    return this.charactersService.update(user.uid, id, dto);
  }

  @Delete('characters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.charactersService.delete(user.uid, id);
  }

  @Post('characters/:id/avatar')
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFileFastify() file: FastifyFile | null,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new AppException(ERR.INVALID_PAYLOAD, 'Không nhận được file upload');
    }
    return this.charactersService.uploadAvatar(user.uid, id, file);
  }
}
