import React from 'react';

const StatusBadge = ({ status }) => {
  const getStatusStyles = (statusString) => {
    switch (statusString?.toLowerCase()) {
      case 'verified':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
      case 'under_review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'partially_verified':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'rejected':
      case 'revoked':
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'expired':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (statusString) => {
    if (!statusString) return 'Unknown';
    return statusString
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
};

export default StatusBadge;
