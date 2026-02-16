import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Pages
import LoginPage from "./pages/Login";
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
      retry: (failureCount, error) => {
        const message =
          error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        // Proxy/backend down should fail fast to avoid retry storms across every screen.
        if (
          message.includes("proxy/backend unavailable") ||
          message.includes("failed to fetch") ||
          message.includes("networkerror")
        ) {
          return false;
        }

        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Login route */}
      <Route path="/login" component={LoginPage} />

      {/* Redirect root to admin */}
      <Route path="/">
        <Redirect to="/admin" />
      </Route>

      {/* Admin routes (protected) */}
      <Route path="/admin">
        <ProtectedRoute>
          <OverviewPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute>
          <UsersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/files">
        <ProtectedRoute>
          <FilesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/queries">
        <ProtectedRoute>
          <QueriesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/quality">
        <ProtectedRoute>
          <QualityPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/llm">
        <ProtectedRoute>
          <LLMPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/reliability">
        <ProtectedRoute>
          <ReliabilityPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/security">
        <ProtectedRoute>
          <SecurityPage />
        </ProtectedRoute>
      </Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
