const { execSync, spawn } = require('child_process');

console.log('=== KHỞI CHẠY DỰ ÁN CHATAI ===\n');

try {
  console.log('1. Khởi động Docker containers (Postgres, Redis, ChromaDB)...');
  execSync('docker compose -f docker-compose.dev.yml up -d', { stdio: 'inherit' });
} catch (error) {
  console.error('Lỗi khi chạy Docker Compose. Vui lòng đảm bảo Docker Desktop đang chạy.');
  process.exit(1);
}

console.log('\n2. Đang chờ PostgreSQL container sẵn sàng...');
let isHealthy = false;
for (let i = 0; i < 30; i++) {
  try {
    const status = execSync('docker inspect --format="{{json .State.Health.Status}}" chatai-postgres', { encoding: 'utf8' }).trim();
    if (status === '"healthy"') {
      isHealthy = true;
      break;
    }
  } catch (e) {
    // container chưa tạo hoặc đang start
  }
  // sleep 1s
  execSync('node -e "setTimeout(() => {}, 1000)"');
}

if (!isHealthy) {
  console.log('Cảnh báo: Không thể xác định trạng thái healthy của PostgreSQL qua Docker healthcheck. Sẽ đợi thêm 5 giây.');
  execSync('node -e "setTimeout(() => {}, 5000)"');
} else {
  console.log('PostgreSQL đã sẵn sàng!');
}

try {
  console.log('\n3. Tạo Prisma Client...');
  execSync('pnpm --filter @chatai/server prisma:generate', { stdio: 'inherit' });

  console.log('\n4. Đồng bộ Database Schema (Prisma Migrate)...');
  // Sử dụng dev mode cho prisma migrate. Sẽ tự động chạy nếu schema không đổi hoặc cập nhật nếu có đổi.
  execSync('pnpm --filter @chatai/server prisma:migrate', { stdio: 'inherit' });

  console.log('\n5. Nạp dữ liệu mẫu (Prisma Seed)...');
  execSync('pnpm --filter @chatai/server db:seed', { stdio: 'inherit' });
} catch (error) {
  console.error('Lỗi khi đồng bộ database:', error.message);
}

console.log('\n6. Khởi chạy Server, Mobile App (Web) và Device Previewer song song...');
const spawnOptions = { stdio: 'inherit', shell: true };

const serverProcess = spawn('pnpm', ['--filter', '@chatai/server', 'dev'], spawnOptions);
const mobileProcess = spawn('pnpm', ['--filter', '@chatai/mobile', 'web'], spawnOptions);
const previewerProcess = spawn('pnpm', ['--filter', '@chatai/previewer', 'dev'], spawnOptions);

process.on('SIGINT', () => {
  console.log('\nĐang tắt các tiến trình...');
  serverProcess.kill();
  mobileProcess.kill();
  previewerProcess.kill();
  process.exit();
});
