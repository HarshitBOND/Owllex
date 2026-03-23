/**
 * Fix OneDrive interference with the .next build cache on Windows.
 *
 * OneDrive's "Files On-Demand" turns .next files into cloud-only reparse points,
 * which causes Node.js readlink() to throw EINVAL. Pinning attributes on the
 * folder is unreliable because files created later by Next.js don't inherit them.
 *
 * Permanent fix: redirect .next to a directory OUTSIDE OneDrive via a Windows
 * directory junction. OneDrive does not follow junctions, so the build cache
 * is never dehydrated.
 *
 * Additionally, pins node_modules as "always available" so OneDrive doesn't
 * dehydrate installed packages.
 *
 * Cache location: %LOCALAPPDATA%\lexvert-cache\<hash>\dot-next
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const dotNext = path.join(projectRoot, '.next');
const nodeModules = path.join(projectRoot, 'node_modules');
const isWindows = process.platform === 'win32';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Check lstat without throwing (returns null on any error) */
function safeLstat(p) {
  try { return fs.lstatSync(p); } catch { return null; }
}

/** True if the path is a junction / symlink */
function isJunction(p) {
  const st = safeLstat(p);
  return st ? st.isSymbolicLink() : false;
}

/** Remove a directory whether it's a junction, corrupted reparse point, or normal dir */
function removeDir(dirPath) {
  if (isJunction(dirPath)) {
    try { fs.rmdirSync(dirPath); return; } catch {}
  }
  try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch {}
  try { execSync(`rmdir /S /Q "${dirPath}"`, { stdio: 'ignore' }); } catch {}
}

/**
 * Pin a folder with attrib +P so OneDrive keeps files locally.
 * Silently ignores errors (non-critical).
 */
function pinFolder(folder) {
  if (!fs.existsSync(folder)) return;
  try {
    execSync(`attrib +P "${folder}" /S /D`, { stdio: 'ignore', timeout: 30000 });
    console.log(`[fix-onedrive] Pinned ${path.basename(folder)} as always-available.`);
  } catch {
    console.log(`[fix-onedrive] Could not pin ${path.basename(folder)} (non-critical).`);
  }
}

/** Read JSON file safely (returns null on any error) */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Read installed Next.js version from node_modules */
function getInstalledNextVersion() {
  const nextPackageJson = path.join(projectRoot, 'node_modules', 'next', 'package.json');
  const pkg = readJson(nextPackageJson);
  return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

/**
 * Ensure redirected cache is healthy and compatible.
 * Resets cache when toolchain changed or when stale partial artifacts are detected.
 */
function ensureHealthyCache(cacheDir) {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const nextVersion = getInstalledNextVersion() || 'unknown';
  const nodeMajor = process.versions.node.split('.')[0];
  const metaPath = path.join(cacheDir, 'lexvert-cache-meta.json');
  const previousMeta = readJson(metaPath);

  let resetReason = null;
  if (
    previousMeta &&
    (previousMeta.nextVersion !== nextVersion || previousMeta.nodeMajor !== nodeMajor)
  ) {
    resetReason =
      `toolchain changed (next ${previousMeta.nextVersion || 'unknown'} → ${nextVersion}, ` +
      `node ${previousMeta.nodeMajor || 'unknown'} → ${nodeMajor})`;
  }

  const serverDir = path.join(cacheDir, 'server');
  const routesManifest = path.join(cacheDir, 'routes-manifest.json');
  if (!resetReason && fs.existsSync(serverDir) && !fs.existsSync(routesManifest)) {
    resetReason = 'stale .next cache missing routes-manifest.json';
  }

  if (resetReason) {
    console.log(`[fix-onedrive] Resetting cache: ${resetReason}.`);
    removeDir(cacheDir);
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  try {
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ nextVersion, nodeMajor, updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch {
    // Non-critical
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

// Non-Windows or project is not under OneDrive → simple mkdir is enough
if (!isWindows || !projectRoot.toLowerCase().includes('onedrive')) {
  if (!fs.existsSync(dotNext)) fs.mkdirSync(dotNext, { recursive: true });
  console.log('[fix-onedrive] .next directory is ready (not on OneDrive).');
  process.exit(0);
}

// Compute a stable cache path outside OneDrive
const localAppData =
  process.env.LOCALAPPDATA ||
  path.join(require('os').homedir(), 'AppData', 'Local');
const hash = crypto
  .createHash('md5')
  .update(projectRoot.toLowerCase())
  .digest('hex')
  .slice(0, 10);
const cacheTarget = path.join(localAppData, 'lexvert-cache', hash, 'dot-next');

// ── .next: junction outside OneDrive ─────────────────────────────────────

if (isJunction(dotNext)) {
  try {
    const target = path.resolve(fs.readlinkSync(dotNext));
    if (target === path.resolve(cacheTarget)) {
      ensureHealthyCache(cacheTarget);
      console.log('[fix-onedrive] .next junction intact → ' + cacheTarget);
      // Pin node_modules and exit
      pinFolder(nodeModules);
      process.exit(0);
    }
  } catch { /* readlink failed – re-create below */ }
  removeDir(dotNext);
}

const stat = safeLstat(dotNext);
if (stat) {
  console.log('[fix-onedrive] Removing old .next from OneDrive-synced folder...');
  removeDir(dotNext);
}

fs.mkdirSync(cacheTarget, { recursive: true });
fs.symlinkSync(cacheTarget, dotNext, 'junction');
ensureHealthyCache(cacheTarget);
console.log('[fix-onedrive] .next redirected to ' + cacheTarget + ' (outside OneDrive).');

// ── node_modules: pin as always-available + bridge junction ──────────
pinFolder(nodeModules);

// Node.js resolves require() from the REAL path (inside the cache dir),
// not the junction path. Create a node_modules junction inside the cache
// base so Node's upward resolution finds the project's node_modules.
const cacheBase = path.dirname(cacheTarget); // .../lexvert-cache/<hash>
const bridgeNM = path.join(cacheBase, 'node_modules');
if (!isJunction(bridgeNM) && fs.existsSync(nodeModules)) {
  try {
    // Remove any stale entry
    const bridgeStat = safeLstat(bridgeNM);
    if (bridgeStat) removeDir(bridgeNM);
    fs.symlinkSync(nodeModules, bridgeNM, 'junction');
    console.log('[fix-onedrive] Bridge junction: cache/node_modules → project node_modules.');
  } catch (e) {
    console.log('[fix-onedrive] Could not create bridge junction (non-critical):', e.message);
  }
} else if (isJunction(bridgeNM)) {
  console.log('[fix-onedrive] Bridge junction for node_modules already exists.');
}
