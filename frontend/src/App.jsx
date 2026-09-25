import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import PublicLayout from './components/PublicLayout';
import RecruiterLayout from './components/RecruiterLayout';
import AdminLayout from './components/AdminLayout';

// Public Pages
import Home from './pages/public/Home';
import VerificationResult from './pages/public/VerificationResult';
import Report from './pages/public/Report';

// Recruiter Pages
import RecruiterRegister from './pages/recruiter/Register';
import RecruiterLogin from './pages/recruiter/Login';
import RecruiterDashboard from './pages/recruiter/Dashboard';
import VerifyIdentity from './pages/recruiter/VerifyIdentity';
import AddCompany from './pages/recruiter/AddCompany';
import CompanyDetails from './pages/recruiter/CompanyDetails';
import SubmitJob from './pages/recruiter/SubmitJob';
import JobDetails from './pages/recruiter/JobDetails';
import VerifyEmailToken from './pages/recruiter/VerifyEmailToken';

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/Dashboard';
import ReviewQueue from './pages/admin/ReviewQueue';
import ReviewDetails from './pages/admin/ReviewDetails';
import ReportsManagement from './pages/admin/Reports';
import AuditLog from './pages/admin/AuditLog';

// Route Guards
const RecruiterProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/recruiter/login" replace />;
  }
  return children;
};

const AdminProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC & JOB SEEKER ROUTES */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/verify" element={<Home />} />
          <Route path="/v/:pin" element={<VerificationResult />} />
          <Route path="/verify/:pin" element={<VerificationResult />} />
          <Route path="/report/:jobAdId" element={<Report />} />
          <Route path="/report" element={<Report />} />
        </Route>

        {/* RECRUITER AUTH (PUBLIC) */}
        <Route path="/recruiter/login" element={<RecruiterLogin />} />
        <Route path="/recruiter/register" element={<RecruiterRegister />} />
        <Route path="/verify-email" element={<VerifyEmailToken />} />

        {/* RECRUITER DASHBOARD & ACTIONS (PROTECTED) */}
        <Route
          path="/recruiter"
          element={
            <RecruiterProtectedRoute>
              <RecruiterLayout />
            </RecruiterProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/recruiter/dashboard" replace />} />
          <Route path="dashboard" element={<RecruiterDashboard />} />
          <Route path="verify" element={<VerifyIdentity />} />
          <Route path="companies/new" element={<AddCompany />} />
          <Route path="companies/:id" element={<CompanyDetails />} />
          <Route path="jobs/new" element={<SubmitJob />} />
          <Route path="jobs/:id" element={<JobDetails />} />
        </Route>

        {/* ADMIN AUTH (PUBLIC) */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* ADMIN DASHBOARD & CONTROLS (PROTECTED) */}
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="queue" element={<ReviewQueue />} />
          <Route path="queue/:id" element={<ReviewDetails />} />
          <Route path="reports" element={<ReportsManagement />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>

        {/* FALLBACK REDIRECT */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
