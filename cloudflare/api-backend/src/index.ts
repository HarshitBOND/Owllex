import { Container } from "@cloudflare/containers";

interface Env {
  RAVENSLAW_BACKEND: DurableObjectNamespace<RavenslawBackend>;
  MONGODB_URI: string;
  MONGODB_DB: string;
  RAVENSLAW_INTERNAL_TOKEN: string;
  OPENAI_API_KEY: string;
  CHROMA_API_KEY: string;
  CHROMA_TENANT: string;
  CHROMA_DATABASE: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_DOCS_BASE_URL: string;
  CLERK_JWT_ISSUER: string;
  RAVENSLAW_CORS_ORIGINS: string;
}

// Single always-on instance, same shape as Render's numInstances: 1 -- state
// lives in MongoDB/Chroma/R2, not in the container, so there's nothing to
// shard by session or user.
const INSTANCE_NAME = "singleton";

export class RavenslawBackend extends Container<Env> {
  defaultPort = 8000;
  // WEB_TIMEOUT below allows requests up to 300s (OCR extraction); sleepAfter
  // is inactivity-based and resets on every request, so long-running requests
  // don't get cut off by this.
  sleepAfter = "15m";
  enableInternet = true;
  pingEndpoint = "/health";

  // Non-secret defaults -- mirrors the envVars block in ../../render.yaml.
  envVars = {
    RAVENSLAW_DEBUG: "false",
    RAVENSLAW_WARM_DOCUMENT_CONVERTER: "true",
    ENABLE_SCRAPER_SCHEDULER: "false",
    PDF_DOWNLOAD_ENABLED: "false",
    WEB_CONCURRENCY: "1",
    WEB_TIMEOUT: "300",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = env.RAVENSLAW_BACKEND.getByName(INSTANCE_NAME);

    // Secrets are only applied by the platform when the container process
    // actually starts (a no-op if it's already running) -- they come from
    // Worker secrets (`wrangler secret put`), never from source here.
    await container.startAndWaitForPorts({
      startOptions: {
        envVars: {
          MONGODB_URI: env.MONGODB_URI,
          MONGODB_DB: env.MONGODB_DB,
          RAVENSLAW_INTERNAL_TOKEN: env.RAVENSLAW_INTERNAL_TOKEN,
          OPENAI_API_KEY: env.OPENAI_API_KEY,
          CHROMA_API_KEY: env.CHROMA_API_KEY,
          CHROMA_TENANT: env.CHROMA_TENANT,
          CHROMA_DATABASE: env.CHROMA_DATABASE,
          R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
          R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
          R2_BUCKET: env.R2_BUCKET,
          R2_PUBLIC_DOCS_BASE_URL: env.R2_PUBLIC_DOCS_BASE_URL,
          CLERK_JWT_ISSUER: env.CLERK_JWT_ISSUER,
          RAVENSLAW_CORS_ORIGINS: env.RAVENSLAW_CORS_ORIGINS,
        },
      },
    });

    return container.fetch(request);
  },
};
