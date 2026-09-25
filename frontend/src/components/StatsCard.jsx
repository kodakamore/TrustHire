import React from 'react';

const StatsCard = ({ title, value, icon, trend }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
      <div className="p-4 rounded-lg bg-blue-50 text-blue-600 mr-5">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          {trend && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
