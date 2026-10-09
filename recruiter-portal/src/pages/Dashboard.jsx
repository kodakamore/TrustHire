import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VerificationProgress from '../components/VerificationProgress';
import StatusBadge from '../components/StatusBadge';
import VerifiedFacePhoto from '../components/VerifiedFacePhoto';
import { verify, company, job } from '../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  // Verification status is fetched from the real API (was mock state).
  const [verificationStatus, setVerificationStatus] = useState({
    emailVerified: false,
    phoneVerified: false,
    identityVerified: false,
    faceVerified: false,
    overallStatus: 'unverified'
  });

  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Real verification status (drives the progress bar + CTA below)
        const vRes = await verify.getStatus();
        const rec = vRes.data?.data;
        if (rec) {
          setVerificationStatus({
            emailVerified: !!rec.is_email_verified,
            phoneVerified: !!rec.is_phone_verified,
            identityVerified: !!rec.is_identity_verified,
            faceVerified: !!rec.is_face_verified,
            overallStatus: rec.verification_status || 'unverified'
          });
        }
        // Companies/jobs listing to be wired when the endpoints are ready;
        // keeping the current placeholders for now.
        setTimeout(() => {
          setCompanies([
            { id: 1, name: 'TechCorp Nigeria', status: 'verified', rcNumber: 'RC123456' }
          ]);
          setJobs([
            { id: 101, title: 'Senior Frontend Developer', company: 'TechCorp Nigeria', status: 'verified', pin: 'X7K9P2', expiresAt: '2026-10-17T00:00:00Z' },
            { id: 102, title: 'Product Manager', company: 'TechCorp Nigeria', status: 'under_review', pin: null, expiresAt: null }
          ]);
          setIsLoading(false);
        }, 300);
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
        <div className="flex items-center space-x-4">
          <VerifiedFacePhoto size="h-16 w-16" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, Recruiter</h1>
            <p className="text-gray-500">Manage your companies and job advertisements here.</p>
          </div>
        </div>
        {verificationStatus.faceVerified && (
          <p className="mt-3 text-xs text-emerald-700 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
            Face verified — this is the image captured during your liveness check.
          </p>
        )}

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
