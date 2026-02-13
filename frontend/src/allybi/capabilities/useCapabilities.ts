import { useEffect, useState } from "react";
import api from "../../services/api";

export interface AllybiCapabilities {
  documentId: string;
  filetype: string;
  supports: {
    docx: boolean;
    sheets: boolean;
    slides: boolean;
    pdfRevisedCopy: boolean;
  };
  operators?: {
    docx?: string[];
    sheets?: string[];
    slides?: string[];
    pdf?: string[];
  };
  operatorMatrix?: {
    canonical: string[];
    runtime: string[];
    unsupported: Array<{ operator: string; reason: string }>;
  };
  alwaysConfirmOperators: string[];
}

export function useCapabilities(documentId: string | null) {
  const [data, setData] = useState<AllybiCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get(`/api/documents/${documentId}/editing/capabilities`)
      .then((res) => {
        if (cancelled) return;
        const payload = (res?.data || null) as AllybiCapabilities | null;
        if (payload && !payload.operatorMatrix && (payload as any).operators?.canonical) {
          payload.operatorMatrix = (payload as any).operators;
        }
        setData(payload);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || e?.message || "Failed to load capabilities");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return { data, loading, error };
}
