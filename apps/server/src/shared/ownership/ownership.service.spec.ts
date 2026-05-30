import { Test, TestingModule } from '@nestjs/testing';
import { OwnershipService } from './ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { ERR } from '../errors/app-exception';

describe('OwnershipService', () => {
  let service: OwnershipService;

  const mockPrisma = {
    story: {
      findUnique: jest.fn(),
    },
    character: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnershipService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OwnershipService>(OwnershipService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertStoryOwner', () => {
    it('should return story if user is the owner', async () => {
      const mockStory = { id: 's1', userId: 'u1' };
      mockPrisma.story.findUnique.mockResolvedValue(mockStory);

      const result = await service.assertStoryOwner('u1', 's1');
      expect(result).toEqual(mockStory);
    });

    it('should throw NOT_FOUND if story does not exist', async () => {
      mockPrisma.story.findUnique.mockResolvedValue(null);

      await expect(service.assertStoryOwner('u1', 's1')).rejects.toThrow(
        expect.objectContaining({ code: ERR.NOT_FOUND })
      );
    });

    it('should throw FORBIDDEN if user is not the owner', async () => {
      const mockStory = { id: 's1', userId: 'u2' };
      mockPrisma.story.findUnique.mockResolvedValue(mockStory);

      await expect(service.assertStoryOwner('u1', 's1')).rejects.toThrow(
        expect.objectContaining({ code: ERR.FORBIDDEN })
      );
    });
  });

  describe('assertCharacterOwner', () => {
    it('should return character if user is the owner of the story', async () => {
      const mockChar = { id: 'c1', storyId: 's1', story: { userId: 'u1' } };
      mockPrisma.character.findUnique.mockResolvedValue(mockChar);

      const result = await service.assertCharacterOwner('u1', 'c1');
      expect(result).toEqual(mockChar);
    });

    it('should throw NOT_FOUND if character does not exist', async () => {
      mockPrisma.character.findUnique.mockResolvedValue(null);

      await expect(service.assertCharacterOwner('u1', 'c1')).rejects.toThrow(
        expect.objectContaining({ code: ERR.NOT_FOUND })
      );
    });

    it('should throw FORBIDDEN if user is not the owner of the story', async () => {
      const mockChar = { id: 'c1', storyId: 's1', story: { userId: 'u2' } };
      mockPrisma.character.findUnique.mockResolvedValue(mockChar);

      await expect(service.assertCharacterOwner('u1', 'c1')).rejects.toThrow(
        expect.objectContaining({ code: ERR.FORBIDDEN })
      );
    });
  });
});
