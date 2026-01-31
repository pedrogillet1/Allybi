import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";

// Pages
import { OverviewPage } from "./pages/overview";
import { UsersPage } from "./pages/users";
import { FilesPage } from "./pages/files";
import { QueriesPage } from "./pages/queries";
import { QualityPage } from "./pages/quality";
import { LLMPage } from "./pages/llm";
import { ReliabilityPage } from "./pages/reliability";
import { SecurityPage } from "./pages/security";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Redirect root to admin */}
      <Route path="/">
        <Redirect to="/admin" />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" component={OverviewPage} />
      <Route path="/admin/users" component={UsersPage} />
      <Route path="/admin/files" component={FilesPage} />
      <Route path="/admin/queries" component={QueriesPage} />
      <Route path="/admin/quality" component={QualityPage} />
      <Route path="/admin/llm" component={LLMPage} />
      <Route path="/admin/reliability" component={ReliabilityPage} />
      <Route path="/admin/security" component={SecurityPage} />

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;
  if (!isAuthenticated) return <LoginPage />;

  return <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <AuthGate />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
