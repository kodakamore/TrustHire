import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VerificationProgress from '../../components/VerificationProgress';
import StatusBadge from '../../components/StatusBadge';
import { verify, company, job } from '../../services/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [recruiter, setRecruiter] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState({
    emailVerified: false,
    phoneVerified: false,
    identityVerified: false,
    faceVerified: false,
  });
  
  const [companies, setCompanies] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      try {
        const [statusRes, compsRes, jobsRes] = await Promise.allSettled([
          verify.getStatus(),
          company.getAll(),
          job.getAll()
        ]);

        if (isMounted) {
          if (statusRes.status === 'fulfilled' && statusRes.value?.data?.data) {
            const r = statusRes.value.data.data;
            setRecruiter(r);
            setVerificationStatus({
              emailVerified: r.is_email_verified || false,
              phoneVerified: r.is_phone_verified || false,
              identityVerified: r.is_identity_verified || false,
              faceVerified: r.is_face_verified || false,
            });
          }

          if (compsRes.status === 'fulfilled' && compsRes.value?.data?.data) {
            setCompanies(compsRes.value.data.data);
          }

          if (jobsRes.status === 'fulfilled' && jobsRes.value?.data?.data) {
            setJobs(jobsRes.value.data.data);
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    fetchDashboardData();
    return () => { isMounted = false; };
  }, []);

  const isFullyVerified = 
    verificationStatus.emailVerified && 
    verificationStatus.phoneVerified && 
    verificationStatus.identityVerified && 
    verificationStatus.faceVerified;

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-gray-500 font-medium">Loading your dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Welcome back, {recruiter ? `${recruiter.first_name} ${recruiter.last_name}` : 'Recruiter'}
        </h1>
        <p className="text-gray-500 text-sm">Manage your certified companies and job advertisements here.</p>
        
        <div className="mt-8">
          <VerificationProgress {...verificationStatus} />
          
          {!isFullyVerified && (
            <div className="mt-6">
              <button 
                onClick={() => navigate('/recruiter/verify')}
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
            {isFullyVerified ? (
              <Link to="/recruiter/companies/new" className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                + Add Company
              </Link>
            ) : (
              <span title="Complete identity verification first" className="text-sm text-gray-400 cursor-not-allowed select-none">
                + Add Company 🔒
              </span>
            )}
          </div>
          
          {companies.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500 text-sm">No companies added yet.</p>
              <Link to="/recruiter/companies/new" className="mt-2 inline-block text-indigo-600 text-sm font-medium">Add your first company</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {companies.map(comp => (
                <li key={comp.id} className="py-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{comp.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{comp.registration_number || comp.rcNumber || 'No RC number'}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <StatusBadge status={comp.verification_status || comp.status || 'pending'} />
                    <Link to={`/recruiter/companies/${comp.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">View</Link>
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
            <Link to="/recruiter/jobs/new" className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
              + Submit Job
            </Link>
          </div>
          
          {jobs.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-gray-500 text-sm">No jobs submitted yet.</p>
              <Link to="/recruiter/jobs/new" className="mt-2 inline-block text-indigo-600 text-sm font-medium">Submit your first job</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {jobs.map(job => (
                <li key={job.id} className="py-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                      <p className="text-xs text-gray-500">{job.company_name || job.company}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  {job.pin && (
                    <div className="mt-2 flex text-xs text-gray-500 space-x-4">
                      <span>PIN: <span className="font-mono font-bold text-indigo-900">{job.pin}</span></span>
                      {job.expires_at && <span>Expires: {new Date(job.expires_at).toLocaleDateString()}</span>}
                    </div>
                  )}
                  <div className="mt-2">
                     <Link to={`/recruiter/jobs/${job.id}`} className="text-indigo-600 hover:text-indigo-900 text-xs font-semibold">View Flyer & Details →</Link>
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
