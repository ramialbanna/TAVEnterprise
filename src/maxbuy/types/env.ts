/**
 * Environment bindings for maxbuy-worker (and in-process evaluate when wired).
 */
export interface MaxbuyWorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  INTEL_WORKER_URL: string;
  INTEL_WORKER_SECRET: string;
  INTEL_WORKER?: Fetcher;
  MAXBUY_SERVICE_SECRET: string;
  MAXBUY_EVALUATE_ENABLED: string;
}

export interface MaxbuyAppEnv {
  MAXBUY_EVALUATE_ENABLED: string;
  MAXBUY_WORKER_URL: string;
  MAXBUY_WORKER_SECRET: string;
  MAXBUY_WORKER?: Fetcher;
}
