import React from 'react';

export default function StatusCard({ icon: Icon, title, message, color }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  };
  
  const iconColors = {
    green: 'text-green-600',
    orange: 'text-orange-500',
    red: 'text-red-600',
    gray: 'text-gray-500',
  };

  const bgClass = colors[color] || colors.gray;
  const iconClass = iconColors[color] || iconColors.gray;

  return (
    <div className={`p-6 sm:p-8 rounded-2xl border flex flex-col items-center text-center gap-4 ${bgClass}`}>
      <Icon className={`w-16 h-16 ${iconClass}`} />
      <h2 className="text-2xl font-bold">{title}</h2>
      {message && <p className="text-lg opacity-90">{message}</p>}
    </div>
  );
}
