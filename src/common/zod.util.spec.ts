import { objectWithoutDefaults } from './zod.util.js';
import { z } from 'zod';
import { updateCompanyConfigSchema } from '../company-config/dto/update-company-config.schema.js';
import { updatePointSchema } from '../point/dto/update-point.schema.js';
import { updateCompanySchema } from '../company/dto/update-company.schema.js';
import { updateVehicleSchema } from '../vehicle/dto/update-vehicle.schema.js';
import { updateAdminUnitySchema } from '../admin-unity/dto/update-admin-unity.schema.js';
import { updateCameraSchema } from '../camera/dto/update-camera.schema.js';
import { updateUserSchema } from '../user/dto/update-user.schema.js';
import { updateMovementSchema } from '../movement/dto/update-movement.schema.js';

const updateSchemas = {
  updateCompanyConfigSchema,
  updatePointSchema,
  updateCompanySchema,
  updateVehicleSchema,
  updateAdminUnitySchema,
  updateCameraSchema,
  updateUserSchema,
  updateMovementSchema,
};

describe('objectWithoutDefaults', () => {
  it('remove defaults para que o update só altere campos enviados', () => {
    const base = z.object({
      name: z.string().default('x'),
      count: z.number().default(10),
    });
    const update = objectWithoutDefaults(base).partial();

    expect(update.parse({ count: 5 })).toEqual({ count: 5 });
    expect(update.parse({})).toEqual({});
  });

  it('remove defaults dentro de optional/nullable aninhados', () => {
    const base = z.object({
      flag: z.boolean().nullable().default(null).optional(),
      value: z.number().int().default(30),
    });
    const update = objectWithoutDefaults(base).partial();

    expect(update.parse({})).toEqual({});
    expect(update.parse({ value: 7 })).toEqual({ value: 7 });
  });

  it('preserva o metadata (descrição) dos campos', () => {
    const base = z.object({
      count: z.number().default(10).meta({ description: 'Contador' }),
    });
    const stripped = objectWithoutDefaults(base).partial();
    const field = stripped.shape.count as unknown as { _zod: { def: { innerType: { meta: () => { description?: string } } } } };

    expect(field._zod.def.innerType.meta().description).toBe('Contador');
  });

  it('não altera o schema de criação (defaults continuam valendo)', () => {
    const base = z.object({ count: z.number().default(10) });
    expect(base.parse({})).toEqual({ count: 10 });
    expect(objectWithoutDefaults(base).parse({ count: 3 })).toEqual({ count: 3 });
  });
});

describe('update schemas de configuração', () => {
  it.each(Object.entries(updateSchemas))('%s não materializa defaults para campos omitidos', (_name, schema) => {
    expect(schema.parse({})).toEqual({});
  });

  it('PATCH de empresa não sobrescreve cooldown/valores omitidos', () => {
    expect(updateCompanyConfigSchema.parse({ anprAutoRegisterCooldownSeconds: 5 }))
      .toEqual({ anprAutoRegisterCooldownSeconds: 5 });
    expect(updateCompanyConfigSchema.parse({ timezone: 'America/New_York' }))
      .toEqual({ timezone: 'America/New_York' });
  });

  it('PATCH de ponto não reseta type/active/inherit nem zera campos ANPR', () => {
    expect(updatePointSchema.parse({ name: 'Novo' })).toEqual({ name: 'Novo' });
    expect(updatePointSchema.parse({ anprAutoRegisterCooldownSeconds: 120 }))
      .toEqual({ anprAutoRegisterCooldownSeconds: 120 });
  });
});
