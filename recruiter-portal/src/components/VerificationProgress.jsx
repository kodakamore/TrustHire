import React from 'react';

const VerificationProgress = ({ emailVerified, phoneVerified, identityVerified, faceVerified }) => {
  const steps = [
    { id: 1, name: 'Email', verified: emailVerified },
    { id: 2, name: 'Phone', verified: phoneVerified },
    { id: 3, name: 'Identity', verified: identityVerified },
    { id: 4, name: 'Face Match', verified: faceVerified },
  ];

  return (
    <div className="w-full py-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-6">Verification Progress</h3>
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="h-0.5 w-full bg-gray-200"></div>
        </div>
        <ul className="relative flex justify-between">
          {steps.map((step, stepIdx) => (
            <li key={step.name} className="flex flex-col items-center">
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                  step.verified
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-gray-300 bg-white text-gray-400'
                } z-10`}
              >
                {step.verified ? (
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span className={`mt-3 text-sm font-medium ${step.verified ? 'text-green-600' : 'text-gray-500'}`}>
                {step.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default VerificationProgress;
