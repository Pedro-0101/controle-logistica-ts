import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import { User } from '../user/entities/user.entity.js';

const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Administrador do Sistema';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@sistema.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

async function seedAdmin() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [User],
    synchronize: true,
  });

  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(User);
    const existing = await repository.findOneBy({ email: ADMIN_EMAIL });

    if (existing) {
      console.log(`Admin "${ADMIN_EMAIL}" já existe. Nenhuma ação necessária.`);
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await repository.save(
      repository.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: 'admin',
        companyId: null,
      }),
    );

    console.log(`Admin criado com sucesso: ${ADMIN_EMAIL}`);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error) => {
  console.error('Falha ao criar o admin padrão:', error);
  process.exit(1);
});
