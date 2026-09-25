import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VerificationProgress from '../components/VerificationProgress';
import StatusBadge from '../components/StatusBadge';
import { verify, company, job } from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  
  // Mock state for now
  const [verificationStatus, setVerificationStatus] = useState({
    emailVerified: true,
    phoneVerified: false,
    identityVerified: false,
    faceVerified: false,
    overallStatus: 'partially_verified'
  });
  
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Normally this would be real API calls
        // const vStatus = await verify.getStatus();
        // const comps = await company.getAll();
        // const js = await job.getAll();
        
        setTimeout(() => {
          setCompanies([
            { id: 1, name: 'TechCorp Nigeria', status: 'verified', rcNumber: 'RC123456' }
          ]);
          setJobs([
            { id: 101, title: 'Senior Frontend Developer', company: 'TechCorp Nigeria', status: 'verified', pin: 'X7K9P2', expiresAt: '2026-10-17T00:00:00Z' },
            { id: 102, title: 'Product Manager', company: 'TechCorp Nigeria', status: 'under_review', pin: null, expiresAt: null }
          ]);
          setIsLoading(false);
        }, 800);
      } catch (error) {
        console.error("Error fetching dashboard data", error);
        setIsLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  const isFullyVerified = 
    verificationStatus.emailVerified && 
    verificationStatus.phoneVerified && 
    verificationStatus.identityVerified && 
    verificationStatus.faceVerified;

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back, Recruiter</h1>
        <p className="text-gray-500">Manage your companies and job advertisements here.</p>
        
        <div className="mt-8">
          <VerificationProgress {...verificationStatus} />
          
          {!isFullyVerified && (
            <div className="mt-6">
              <button 
                onClick={() => navigate('/verify-identity')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Complete Verification
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Companies Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">My Companies</h2>
            <Link to="/companies/new" className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
              + Add Company
            </Link>
          </div>
          
          {companies.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500 text-sm">No companies added yet.</p>
              <Link to="/companies/new" className="mt-2 inline-block text-indigo-600 text-sm font-medium">Add your first company</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {companies.map(comp => (
                <li key={comp.id} className="py-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{comp.name}</p>
                    <p className="text-xs text-gray-500">{comp.rcNumber}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <StatusBadge status={comp.status} />
                    <Link to={`/companies/${comp.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm">View</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Jobs Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Job Advertisements</h2>
            <Link to="/jobs/new" className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
              + Submit Job
            </Link>
          </div>
          
          {jobs.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500 text-sm">No jobs submitted yet.</p>
              <Link to="/jobs/new" className="mt-2 inline-block text-indigo-600 text-sm font-medium">Submit your first job</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {jobs.map(job => (
                <li key={job.id} className="py-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                      <p className="text-xs text-gray-500">{job.company}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  {job.status === 'verified' && job.pin && (
                    <div className="mt-2 flex text-xs text-gray-500 space-x-4">
                      <span>PIN: <span className="font-mono font-medium text-gray-900">{job.pin}</span></span>
                      <span>Expires: {new Date(job.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="mt-2">
                     <Link to={`/jobs/${job.id}`} className="text-indigo-600 hover:text-indigo-900 text-xs font-medium">View Details</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
