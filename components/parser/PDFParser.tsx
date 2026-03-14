/**
 * Example: PDF Parser Component
 * Demonstrates how to use the backend parser service
 * 
 * Usage: Import and use in your case tracking page
 * <PDFParser onCasesParsed={handleCasesParsed} />
 */

'use client';

import { useState } from 'react';
import { parsePDFFile } from '@/lib/backendClient';

interface ParsedCase {
  case_number: string;
  petitioner: string;
  respondent: string;
  hearing_date: string;
  list_type: string;
  [key: string]: unknown;
}

interface PDFParserProps {
  onCasesParsed?: (cases: ParsedCase[]) => void;
  onError?: (error: string) => void;
}

export function PDFParser({ onCasesParsed, onError }: PDFParserProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setProgress('Uploading and parsing PDF...');

    try {
      const result = await parsePDFFile(file);

      if (!result.success) {
        throw new Error(result.error || 'Failed to parse PDF');
      }

      setProgress(`✓ Parsed ${result.total_cases} cases successfully!`);
      onCasesParsed?.(result.cases);

      // Reset after 2 seconds
      setTimeout(() => setProgress(''), 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setProgress('');
      onError?.(errorMessage);
      console.error('Parse error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <h3 className="font-semibold">Upload Court Cause List PDF</h3>
      
      <label className="cursor-pointer">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          disabled={isLoading}
          className="block w-full text-sm"
        />
      </label>

      {progress && (
        <p className="text-sm text-blue-600">{progress}</p>
      )}

      {isLoading && (
        <div className="text-sm text-gray-600">
          Processing... This may take a few moments for large PDFs.
        </div>
      )}
    </div>
  );
}

/**
 * Example usage in a case tracking page:
 * 
 * export default function CaseTrackingPage() {
 *   const [parsedCases, setParsedCases] = useState<ParsedCase[]>([]);
 *
 *   return (
 *     <div>
 *       <PDFParser onCasesParsed={setParsedCases} />
 *       
 *       <div className="mt-8">
 *         <h2>Parsed Cases: {parsedCases.length}</h2>
 *         {parsedCases.map((caseItem) => (
 *           <div key={caseItem.case_number}>
 *             <h3>{caseItem.case_number}</h3>
 *             <p>Hearing: {caseItem.hearing_date}</p>
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 */
