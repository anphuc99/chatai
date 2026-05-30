import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StoriesService } from './stories.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { AuthUser } from '../../shared/types/auth-user';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { ListStoriesQuery } from './dto/list-stories.query';
import { StoryDto, PaginatedResponse } from '@chatai/shared-types';

@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListStoriesQuery,
  ): Promise<PaginatedResponse<StoryDto>> {
    return this.storiesService.list(user.uid, query.cursor, query.limit);
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<StoryDto> {
    return this.storiesService.getById(user.uid, id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStoryDto,
  ): Promise<StoryDto> {
    return this.storiesService.create(user.uid, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStoryDto,
  ): Promise<StoryDto> {
    return this.storiesService.update(user.uid, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.storiesService.delete(user.uid, id);
  }
}
