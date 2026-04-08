/**
 * Backend API client
 * Centralized utility for calling the Python FastAPI backend service
 */

const BACKEND_API = process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:8000';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Parse a PDF file using the backend service
 */
export async function parsePDFFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('save_to_db', 'true'); // Optional: save to database

  const response = await fetch(`${BACKEND_API}/api/v1/parse`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check backend service health
 */
export async function checkBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_API}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}

/**
 * Parse PDF from server file path (internal use)
 */
export async function parsePDFFromPath(filePath: string) {
  const response = await fetch(`${BACKEND_API}/api/v1/parse/path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_path: filePath }),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

const backendClient = {
  parsePDFFile,
  checkBackendHealth,
  parsePDFFromPath,
  triggerCauselistBulkImport,
  getCauselistImportProgress,
  getCauselistStatus,
};

export default backendClient;

/**
 * Trigger bulk cause list import
 */
export async function triggerCauselistBulkImport(options: {
  days_back?: number;
  auto_delete_pdfs?: boolean;
  start_from_checkpoint?: boolean;
}) {
  const response = await fetch(`${BACKEND_API}/api/v1/scraper/parse-causelist-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get progress of a bulk causelist import
 */
export async function getCauselistImportProgress(importId: string) {
  const response = await fetch(
    `${BACKEND_API}/api/v1/scraper/progress/${encodeURIComponent(importId)}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get causelist import status and checkpoint info
 */
export async function getCauselistStatus() {
  const response = await fetch(`${BACKEND_API}/api/v1/scraper/causelist-status`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.statusText}`);
  }

  return response.json();
}
