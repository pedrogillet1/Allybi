import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Admin Pages
import {
  Overview,
  Users,
  UserDetail,
  Files,
  FileDetail,
  Queries,
  AnswerQuality,
  LLMCost,
  Reliability,
  Security,
} from "./pages/admin";

function Router() {
  return (
    <Switch>
      {/* Redirect root to admin dashboard */}
      <Route path="/">
        <Redirect to="/admin" />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" component={Overview} />
      <Route path="/admin/users" component={Users} />
      <Route path="/admin/users/:id" component={UserDetail} />
      <Route path="/admin/files" component={Files} />
      <Route path="/admin/files/:id" component={FileDetail} />
      <Route path="/admin/queries" component={Queries} />
      <Route path="/admin/quality" component={AnswerQuality} />
      <Route path="/admin/llm" component={LLMCost} />
      <Route path="/admin/reliability" component={Reliability} />
      <Route path="/admin/security" component={Security} />

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Koda Admin Dashboard
 * Swiss Brutalist Tech Design
 * Light theme with pure white background and black typography
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
