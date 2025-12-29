import { z } from 'zod';

// Schemat strony (page info)
const PageInfoSchema = z
  .object({
    url: z.string().max(2000).optional(),
    path: z.string().max(500).optional(),
    hostname: z.string().max(255).optional(),
    search: z.string().max(2000).optional().nullable(),
    hash: z.string().max(500).optional().nullable(),
    title: z.string().max(500).optional().nullable(),
    referrer: z.string().max(2000).optional().nullable(),
  })
  .passthrough();

// Schemat pojedynczego eventu
const EventSchema = z
  .object({
    id: z.string().uuid(),
    timestamp: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid timestamp format' }),
    siteId: z.string().min(1).max(255),
    sessionId: z.string().uuid(),
    visitorId: z.string().uuid(),
    eventType: z.string().min(1).max(50),
    page: PageInfoSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough();

// Schemat informacji o urządzeniu
const DeviceInfoSchema = z
  .object({
    userAgent: z.string().max(1000).optional().nullable(),
    language: z.string().max(50).optional().nullable(),
    languages: z.array(z.string()).optional().nullable(),
    platform: z.string().max(100).optional().nullable(),
    screenWidth: z.number().int().min(0).max(10000).optional().nullable(),
    screenHeight: z.number().int().min(0).max(10000).optional().nullable(),
    viewportWidth: z.number().int().min(0).max(10000).optional().nullable(),
    viewportHeight: z.number().int().min(0).max(10000).optional().nullable(),
    devicePixelRatio: z.number().min(0).max(10).optional().nullable(),
    touchSupport: z.boolean().optional().nullable(),
    cookiesEnabled: z.boolean().optional().nullable(),
    doNotTrack: z.boolean().optional().nullable(),
    timezone: z.string().max(100).optional().nullable(),
    timezoneOffset: z.number().optional().nullable(),
  })
  .passthrough();

// Schemat parametrów UTM
const UtmParamsSchema = z
  .object({
    utm_source: z.string().max(255).optional().nullable(),
    utm_medium: z.string().max(255).optional().nullable(),
    utm_campaign: z.string().max(255).optional().nullable(),
    utm_term: z.string().max(255).optional().nullable(),
    utm_content: z.string().max(255).optional().nullable(),
  })
  .passthrough();

// Główny schemat payloadu /api/collect
export const CollectPayloadSchema = z.object({
  events: z.array(EventSchema).min(1).max(100),
  device: DeviceInfoSchema.optional().nullable(),
  utm: UtmParamsSchema.optional().nullable(),
});

// Schemat hasła logowania
export const LoginSchema = z.object({
  password: z.string().min(1).max(255),
});

// Typy eksportowane
export type CollectPayload = z.infer<typeof CollectPayloadSchema>;
export type ValidatedEvent = z.infer<typeof EventSchema>;
export type ValidatedDeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type ValidatedUtmParams = z.infer<typeof UtmParamsSchema>;

// Funkcja pomocnicza do walidacji
export function validateCollectPayload(
  data: unknown,
): { success: true; data: CollectPayload } | { success: false; error: string } {
  try {
    const validated = CollectPayloadSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return { success: false, error: `Validation failed: ${messages}` };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}
