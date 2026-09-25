import React from 'react';
import { useParams, Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';

const CompanyDetails = () => {
  const { id } = useParams();

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TechCorp Nigeria</h1>
          <p className="text-gray-500">RC123456</p>
        </div>
        <StatusBadge status="verified" />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-4">Company Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Industry</p>
              <p className="font-medium text-gray-900">Technology</p>
            </div>
            <div>
              <p className="text-gray-500">Website</p>
              <a href="#" className="font-medium text-indigo-600 hover:underline">www.techcorp.com.ng</a>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Address</p>
              <p className="font-medium text-gray-900">123 Tech Avenue, Victoria Island, Lagos</p>
            </div>
          </div>
        </div>
        
        <div className="pt-4">
          <Link to="/dashboard" className="text-indigo-600 hover:text-indigo-800 font-medium">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CompanyDetails;
