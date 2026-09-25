import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import Dashboard from './pages/Dashboard';
import ReviewQueue from './pages/ReviewQueue';
import ReviewDetails from './pages/ReviewDetails';
import Reports from './pages/Reports';
import AuditLog from './pages/AuditLog';

const AdminProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        
        <Route path="/" element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="queue" element={<ReviewQueue />} />
          <Route path="queue/:id" element={<ReviewDetails />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
