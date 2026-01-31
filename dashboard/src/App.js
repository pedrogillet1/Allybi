import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { Sidebar } from './components/dashboard/layout/Sidebar';
import { LoadingSpinner } from './components/dashboard/ui/LoadingSpinner';
import {
  Overview,
  IntentAnalysis,
  Retrieval,
  Errors,
  Users,
  Database,
} from './components/dashboard/pages';
import './components/dashboard/dashboard.css';
import './App.css';

/**
 * ProtectedRoute component to guard authenticated routes
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * DashboardLayout component that wraps dashboard pages
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
const DashboardLayout = ({ children }) => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
};

/**
 * Main App component with routing
 * @returns {React.ReactElement}
 */
function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Loading application..." />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Route - Login */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        }
      />

      {/* Protected Dashboard Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Overview />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/intent-analysis"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <IntentAnalysis />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/retrieval"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Retrieval />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/errors"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Errors />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Users />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/database"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Database />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
