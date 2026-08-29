import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['user', 'admin', 'supervisor']).default('user'),
  companyId: z.string().min(1, 'Company ID is required'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
