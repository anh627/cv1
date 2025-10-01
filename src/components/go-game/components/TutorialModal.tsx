// src/components/go-game/components/TutorialModal.tsx

import React, { useState } from 'react';
import { TUTORIAL_MESSAGES } from '../constants';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal = React.memo(({ isOpen, onClose }: TutorialModalProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  
  const steps = Object.entries(TUTORIAL_MESSAGES).map(([key, { text, tip }]) => ({
    key: key.charAt(0).toUpperCase() + key.slice(1),
    text,
    tip,
    icon: key === 'placement' ? '📍' : 
          key === 'capture' ? '🎯' :
          key === 'ko' ? '🔄' :
          key === 'pass' ? '⏭️' :
          key === 'territory' ? '🏰' :
          key === 'scoring' ? '🏆' :
          key === 'eyes' ? '👁️' : '❓'
  }));

  if (!isOpen) return null;

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6 sm:p-8 rounded-3xl max-w-lg w-full border border-purple-500/30 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            Game Tutorial
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center text-gray-400 text-sm mt-2">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-4xl">{steps[currentStep].icon}</span>
            <h3 className="text-xl font-bold text-white">
              {steps[currentStep].key}
            </h3>
          </div>
          <p className="text-gray-300 mb-4 leading-relaxed">
            {steps[currentStep].text}
          </p>
          <div className="bg-purple-900/30 rounded-xl p-4 border border-purple-500/30">
            <p className="text-purple-300 text-sm">
              <span className="font-bold">💡 Pro Tip:</span> {steps[currentStep].tip}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className={`flex-1 py-3 rounded-xl font-semibold transition-all duration-200 ${
              currentStep === 0 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
            }`}
          >
            Previous
          </button>
          <button
            onClick={() => {
              if (currentStep === steps.length - 1) {
                onClose();
              } else {
                setCurrentStep(currentStep + 1);
              }
            }}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 font-semibold transition-all duration-200 shadow-lg"
          >
            {currentStep === steps.length - 1 ? 'Start Playing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
});

TutorialModal.displayName = 'TutorialModal';
