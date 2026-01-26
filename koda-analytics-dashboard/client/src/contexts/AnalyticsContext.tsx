import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import AnalyticsAPI from '@/lib/analytics-api';
import type {
  AnalyticsOverview,
  UserAnalytics,
  ConversationAnalytics,
  DocumentAnalytics,
  SystemHealth,
  CostAnalytics,
  // Control Plane Types
  IntentAnalytics,
  RetrievalAnalytics,
  QualityAnalytics,
  LanguageAnalytics,
  PerformanceAnalytics,
  TelemetryCostAnalytics,
  QueryListItem,
  QueryListResponse,
  QueryDetail,
} from '@/lib/analytics-api';
import type { Environment } from '@/lib/environments';
import { ENVIRONMENTS, DEFAULT_ENVIRONMENT } from '@/lib/environments';
import { toast } from 'sonner';

interface AnalyticsContextType {
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  loading: boolean;
  error: string | null;

  // Legacy analytics
  overview: AnalyticsOverview | null;
  users: UserAnalytics | null;
  conversations: ConversationAnalytics | null;
  documents: DocumentAnalytics | null;
  systemHealth: SystemHealth | null;
  costs: CostAnalytics | null;

  // Control Plane analytics
  intentAnalytics: IntentAnalytics | null;
  retrievalAnalytics: RetrievalAnalytics | null;
  qualityAnalytics: QualityAnalytics | null;
  languageAnalytics: LanguageAnalytics | null;
  performanceAnalytics: PerformanceAnalytics | null;
  telemetryCosts: TelemetryCostAnalytics | null;
  queryList: QueryListResponse | null;
  selectedQuery: QueryDetail | null;

  // Loading states for control plane
  intentLoading: boolean;
  retrievalLoading: boolean;
  qualityLoading: boolean;
  languageLoading: boolean;
  performanceLoading: boolean;
  telemetryCostsLoading: boolean;
  queryListLoading: boolean;

  // Legacy fetch functions
  fetchOverview: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchDocuments: () => Promise<void>;
  fetchSystemHealth: () => Promise<void>;
  fetchCosts: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Control Plane fetch functions
  fetchIntentAnalytics: (days?: number) => Promise<void>;
  fetchRetrievalAnalytics: (days?: number) => Promise<void>;
  fetchQualityAnalytics: (days?: number) => Promise<void>;
  fetchLanguageAnalytics: (days?: number) => Promise<void>;
  fetchPerformanceAnalytics: (days?: number) => Promise<void>;
  fetchTelemetryCosts: (days?: number) => Promise<void>;
  fetchQueryList: (options?: {
    limit?: number;
    offset?: number;
    intent?: string;
    language?: string;
    failureCategory?: string;
    isUseful?: boolean;
  }) => Promise<void>;
  fetchQueryDetail: (id: string) => Promise<void>;
  refreshControlPlane: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<Environment>(
    ENVIRONMENTS[DEFAULT_ENVIRONMENT]
  );
  const [api] = useState(() => new AnalyticsAPI(ENVIRONMENTS[DEFAULT_ENVIRONMENT]));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Legacy state
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [users, setUsers] = useState<UserAnalytics | null>(null);
  const [conversations, setConversations] = useState<ConversationAnalytics | null>(null);
  const [documents, setDocuments] = useState<DocumentAnalytics | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [costs, setCosts] = useState<CostAnalytics | null>(null);

  // Control Plane state
  const [intentAnalytics, setIntentAnalytics] = useState<IntentAnalytics | null>(null);
  const [retrievalAnalytics, setRetrievalAnalytics] = useState<RetrievalAnalytics | null>(null);
  const [qualityAnalytics, setQualityAnalytics] = useState<QualityAnalytics | null>(null);
  const [languageAnalytics, setLanguageAnalytics] = useState<LanguageAnalytics | null>(null);
  const [performanceAnalytics, setPerformanceAnalytics] = useState<PerformanceAnalytics | null>(null);
  const [telemetryCosts, setTelemetryCosts] = useState<TelemetryCostAnalytics | null>(null);
  const [queryList, setQueryList] = useState<QueryListResponse | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<QueryDetail | null>(null);

  // Control Plane loading states
  const [intentLoading, setIntentLoading] = useState(false);
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [languageLoading, setLanguageLoading] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [telemetryCostsLoading, setTelemetryCostsLoading] = useState(false);
  const [queryListLoading, setQueryListLoading] = useState(false);

  const setEnvironment = useCallback((env: Environment) => {
    setEnvironmentState(env);
    api.setEnvironment(env);
    toast.success(`Switched to ${env.name}`);
  }, [api]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY FETCH FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOverview();
      setOverview(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch overview';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUserAnalytics();
      setUsers(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch user analytics';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getConversationAnalytics();
      setConversations(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch conversation analytics';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDocumentAnalytics();
      setDocuments(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch document analytics';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchSystemHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSystemHealth();
      setSystemHealth(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch system health';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCostAnalytics();
      setCosts(data);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to fetch cost analytics';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL PLANE FETCH FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchIntentAnalytics = useCallback(async (days: number = 7) => {
    setIntentLoading(true);
    try {
      const data = await api.getIntentAnalytics(days);
      setIntentAnalytics(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch intent analytics');
    } finally {
      setIntentLoading(false);
    }
  }, [api]);

  const fetchRetrievalAnalytics = useCallback(async (days: number = 7) => {
    setRetrievalLoading(true);
    try {
      const data = await api.getRetrievalAnalytics(days);
      setRetrievalAnalytics(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch retrieval analytics');
    } finally {
      setRetrievalLoading(false);
    }
  }, [api]);

  const fetchQualityAnalytics = useCallback(async (days: number = 7) => {
    setQualityLoading(true);
    try {
      const data = await api.getQualityAnalytics(days);
      setQualityAnalytics(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch quality analytics');
    } finally {
      setQualityLoading(false);
    }
  }, [api]);

  const fetchLanguageAnalytics = useCallback(async (days: number = 7) => {
    setLanguageLoading(true);
    try {
      const data = await api.getLanguageAnalytics(days);
      setLanguageAnalytics(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch language analytics');
    } finally {
      setLanguageLoading(false);
    }
  }, [api]);

  const fetchPerformanceAnalytics = useCallback(async (days: number = 7) => {
    setPerformanceLoading(true);
    try {
      const data = await api.getPerformanceAnalytics(days);
      setPerformanceAnalytics(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch performance analytics');
    } finally {
      setPerformanceLoading(false);
    }
  }, [api]);

  const fetchTelemetryCosts = useCallback(async (days: number = 30) => {
    setTelemetryCostsLoading(true);
    try {
      const data = await api.getTelemetryCostAnalytics(days);
      setTelemetryCosts(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch telemetry costs');
    } finally {
      setTelemetryCostsLoading(false);
    }
  }, [api]);

  const fetchQueryList = useCallback(async (options: {
    limit?: number;
    offset?: number;
    intent?: string;
    language?: string;
    failureCategory?: string;
    isUseful?: boolean;
  } = {}) => {
    setQueryListLoading(true);
    try {
      const data = await api.getQueryList(options);
      setQueryList(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch query list');
    } finally {
      setQueryListLoading(false);
    }
  }, [api]);

  const fetchQueryDetail = useCallback(async (id: string) => {
    try {
      const data = await api.getQueryDetail(id);
      setSelectedQuery(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch query detail');
    }
  }, [api]);

  // ═══════════════════════════════════════════════════════════════════════════
  // REFRESH ALL
  // ═══════════════════════════════════════════════════════════════════════════

  const refreshAll = useCallback(async () => {
    toast.info('Refreshing all analytics...');
    await Promise.all([
      fetchOverview(),
      fetchUsers(),
      fetchConversations(),
      fetchDocuments(),
      fetchSystemHealth(),
      fetchCosts()
    ]);
    toast.success('Analytics refreshed');
  }, [fetchOverview, fetchUsers, fetchConversations, fetchDocuments, fetchSystemHealth, fetchCosts]);

  const refreshControlPlane = useCallback(async () => {
    toast.info('Refreshing control plane...');
    await Promise.all([
      fetchIntentAnalytics(),
      fetchRetrievalAnalytics(),
      fetchQualityAnalytics(),
      fetchLanguageAnalytics(),
      fetchPerformanceAnalytics(),
      fetchTelemetryCosts(),
      fetchQueryList({ limit: 50 })
    ]);
    toast.success('Control plane refreshed');
  }, [
    fetchIntentAnalytics,
    fetchRetrievalAnalytics,
    fetchQualityAnalytics,
    fetchLanguageAnalytics,
    fetchPerformanceAnalytics,
    fetchTelemetryCosts,
    fetchQueryList
  ]);

  return (
    <AnalyticsContext.Provider
      value={{
        environment,
        setEnvironment,
        loading,
        error,
        // Legacy
        overview,
        users,
        conversations,
        documents,
        systemHealth,
        costs,
        // Control Plane data
        intentAnalytics,
        retrievalAnalytics,
        qualityAnalytics,
        languageAnalytics,
        performanceAnalytics,
        telemetryCosts,
        queryList,
        selectedQuery,
        // Control Plane loading states
        intentLoading,
        retrievalLoading,
        qualityLoading,
        languageLoading,
        performanceLoading,
        telemetryCostsLoading,
        queryListLoading,
        // Legacy fetch
        fetchOverview,
        fetchUsers,
        fetchConversations,
        fetchDocuments,
        fetchSystemHealth,
        fetchCosts,
        refreshAll,
        // Control Plane fetch
        fetchIntentAnalytics,
        fetchRetrievalAnalytics,
        fetchQualityAnalytics,
        fetchLanguageAnalytics,
        fetchPerformanceAnalytics,
        fetchTelemetryCosts,
        fetchQueryList,
        fetchQueryDetail,
        refreshControlPlane
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }
  return context;
}

// Alias for cleaner imports
export const useAnalytics = useAnalyticsContext;

export default AnalyticsContext;
