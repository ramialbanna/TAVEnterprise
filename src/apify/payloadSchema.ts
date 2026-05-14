import { z } from "zod";

/**
 * Subset of the Apify webhook payload we actually consume. Apify sends a much
 * richer object; everything not validated here is ignored to keep the bridge
 * resilient to upstream additions. The `passthrough()` mode lets unrecognized
 * fields through without rejecting the request.
 *
 * Reference: https://docs.apify.com/platform/integrations/webhooks/events
 */
export const ApifyWebhookPayloadSchema = z
  .object({
    eventType: z.string().min(1),
    resource: z
      .object({
        id:                z.string().min(1),
        actorTaskId:       z.string().min(1).optional(),
        defaultDatasetId:  z.string().min(1).optional(),
        finishedAt:        z.string().datetime().optional(),
        startedAt:         z.string().datetime().optional(),
        status:            z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type ApifyWebhookPayload = z.infer<typeof ApifyWebhookPayloadSchema>;

/**
 * Event types that should trigger an actual ingest dispatch. All other events
 * (ACTOR.RUN.FAILED, ACTOR.RUN.ABORTED, ACTOR.RUN.TIMED_OUT, etc.) 200-noop.
 */
export const SUCCEEDED_EVENT_TYPES: ReadonlySet<string> = new Set([
  "ACTOR.RUN.SUCCEEDED",
]);

export function isSucceededEvent(eventType: string): boolean {
  return SUCCEEDED_EVENT_TYPES.has(eventType);
}
