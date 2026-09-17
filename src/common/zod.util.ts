import { z } from 'zod';

/**
 * Remove os `default()` dos campos de um schema de objeto.
 *
 * `schema.partial()` NÃO elimina defaults: ao validar um PATCH, os campos
 * omitidos voltariam preenchidos com o valor padrão e sobrescreveriam o
 * registro no `Object.assign`. Este helper garante que os updates só alterem
 * os campos realmente enviados.
 */
export function objectWithoutDefaults<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): z.ZodObject<T> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, withoutDefaults(field as z.ZodTypeAny)]),
  ) as unknown as T;
  return z.object(shape);
}

interface ZodMeta {
  meta?: () => Record<string, unknown> | undefined;
  removeDefault?: () => z.ZodTypeAny;
  _zod?: { def?: { type?: string; innerType?: z.ZodTypeAny } };
}

function withoutDefaults(schema: z.ZodTypeAny): z.ZodTypeAny {
  const typed = schema as unknown as ZodMeta;
  const def = typed._zod?.def;
  const meta = typed.meta?.();
  let result: z.ZodTypeAny | undefined;

  if (def?.type === 'default' && typeof typed.removeDefault === 'function') {
    result = withoutDefaults(typed.removeDefault());
  } else if (def?.type === 'optional' && def.innerType) {
    result = withoutDefaults(def.innerType).optional();
  }
  if (!result) return schema;

  // Preserva as descrições do Swagger, removendo o `default` do metadata.
  if (meta) {
    const rest: Record<string, unknown> = { ...(meta as Record<string, unknown>) };
    delete rest.default;
    if (Object.keys(rest).length > 0) result = result.meta(rest);
  }
  return result;
}
