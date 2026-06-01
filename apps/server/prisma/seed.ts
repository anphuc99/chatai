import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const shopItems = [
  {
    id: 'streak_freeze',
    name: 'Streak Freeze',
    description: 'Bảo vệ chuỗi học liên tiếp của bạn khi lỡ một ngày.',
    priceGems: 50,
    category: 'system',
    active: true,
  },
  {
    id: 'gem_pack_small',
    name: 'Gói Gem Nhỏ',
    description: 'Mua thêm Gem qua IAP (chưa khả dụng).',
    priceGems: 0,
    category: 'system',
    active: false,
  },
  {
    id: 'love_ring',
    name: 'Vòng Tình Yêu',
    description: 'Món quà nhỏ xinh cho nhân vật yêu thích của bạn.',
    priceGems: 15,
    category: 'contextual',
    active: true,
  },
  {
    id: 'shield_charm',
    name: 'Bùa Hộ Mệnh',
    description: 'Bùa hộ thân bảo vệ nhân vật trong hành trình.',
    priceGems: 25,
    category: 'contextual',
    active: true,
  },
];

async function main() {
  console.log('Seeding shop items...');
  for (const item of shopItems) {
    await prisma.shopItem.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
    console.log(`  ✓ ${item.id}`);
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
