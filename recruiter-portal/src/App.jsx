import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import VerifyIdentity from './pages/VerifyIdentity';
import AddCompany from './pages/AddCompany';
import CompanyDetails from './pages/CompanyDetails';
import SubmitJob from './pages/SubmitJob';
import JobDetails from './pages/JobDetails';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const token = localStorage.getItem('token');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="verify-identity" element={<VerifyIdentity />} />
          <Route path="companies/new" element={<AddCompany />} />
          <Route path="companies/:id" element={<CompanyDetails />} />
          <Route path="jobs/new" element={<SubmitJob />} />
          <Route path="jobs/:id" element={<JobDetails />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
