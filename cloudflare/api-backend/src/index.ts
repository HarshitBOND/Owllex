import { Container } from "@cloudflare/containers";

interface Env {
  RAVENSLAW_BACKEND: DurableObjectNamespace<RavenslawBackend>;
  /**
   * Origin of the Ubuntu VPS running the backend, e.g. https://api.example.com.
   * When set, this Worker is a thin auth/routing proxy in front of that host --
   * which is the supported topology since the RAG stack became stateful.
   * When unset, it falls back to hosting the backend in a Cloudflare container.
   */
  VPS_ORIGIN?: string;
  MONGODB_URI: string;
  MONGODB_DB: string;
  RAVENSLAW_INTERNAL_TOKEN: string;
  CLERK_JWT_ISSUER: string;
  RAVENSLAW_CORS_ORIGINS: string;
}

// Single always-on instance. Only meaningful in the legacy container mode below.
const INSTANCE_NAME = "singleton";

// Non-secret defaults for the legacy container mode.
const NON_SECRET_ENV = {
  RAVENSLAW_DEBUG: "false",
  RAVENSLAW_WARM_DOCUMENT_CONVERTER: "true",
  ENABLE_SCRAPER_SCHEDULER: "false",
  PDF_DOWNLOAD_ENABLED: "false",
  WEB_CONCURRENCY: "1",
  WEB_TIMEOUT: "300",
  // Starlette's TrustedHostMiddleware rejects any other Host outright, and
  // config.py refuses to boot in production without this set. localhost stays
  // in the list because the platform's own port/health probes reach the
  // container directly rather than through the workers.dev hostname.
  RAVENSLAW_TRUSTED_HOSTS:
    "owllex-backend.owllex-backend-container.workers.dev,localhost,127.0.0.1",
  // Container filesystems do not survive a restart, so a container-hosted
  // backend must never be pointed at a real corpus. See the warning below.
  DATA_ROOT: "/tmp/ravenslaw-data",
  BACKUP_ENABLED: "false",
};

/**
 * Legacy mode: run the FastAPI backend inside a Cloudflare container.
 *
 * WARNING -- this mode is no longer suitable for the RAG corpus. The backend is
 * now stateful: FAISS indexes, the SQLite metadata database, the LMDB hash index
 * and every archived PDF live under DATA_ROOT. A container's filesystem is
 * ephemeral, so each restart would silently discard the entire corpus and the
 * service would come back up looking healthy and empty.
 *
 * DATA_ROOT above therefore points at /tmp on purpose: this mode is for the
 * stateless routes (cause-list parsing, extraction) only. Set VPS_ORIGIN to
 * route to the Hetzner host instead, which is where the mounted volume is.
 */
export class RavenslawBackend extends Container<Env> {
  defaultPort = 8000;
  // WEB_TIMEOUT below allows requests up to 300s (OCR extraction); sleepAfter
  // is inactivity-based and resets on every request, so long-running requests
  // don't get cut off by this.
  sleepAfter = "15m";
  enableInternet = true;
  pingEndpoint = "/health";

  envVars = NON_SECRET_ENV;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.VPS_ORIGIN) {
      return proxyToVps(request, env.VPS_ORIGIN);
    }

    const container = env.RAVENSLAW_BACKEND.getByName(INSTANCE_NAME);

    // Secrets are only applied by the platform when the container process
    // actually starts (a no-op if it's already running) -- they come from
    // Worker secrets (`wrangler secret put`), never from source here.
    await container.startAndWaitForPorts({
      startOptions: {
        // startOptions.envVars REPLACES the class-level envVars rather than
        // merging with it, so the non-secret defaults have to be respread here.
        envVars: {
          ...NON_SECRET_ENV,
          MONGODB_URI: env.MONGODB_URI,
          MONGODB_DB: env.MONGODB_DB,
          RAVENSLAW_INTERNAL_TOKEN: env.RAVENSLAW_INTERNAL_TOKEN,
          CLERK_JWT_ISSUER: env.CLERK_JWT_ISSUER,
          RAVENSLAW_CORS_ORIGINS: env.RAVENSLAW_CORS_ORIGINS,
        },
      },
    });

    return container.fetch(request);
  },
};

/**
 * Forward the request to the VPS unchanged.
 *
 * The body is streamed rather than buffered: ingest uploads run to tens of
 * megabytes, and reading one into memory here would both add latency and risk
 * the Worker's memory limit. The Host header is rewritten to the origin so the
 * backend's TrustedHostMiddleware sees a hostname it is configured to accept.
 */
async function proxyToVps(request: Request, origin: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(request.headers);
  headers.set("Host", target.host);
  // Preserve the caller's IP for the backend's per-IP rate limiter, which would
  // otherwise see every request as coming from Cloudflare.
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  return fetch(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
}
