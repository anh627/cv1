// src/components/go-game/components/TimerDisplay.tsx

import React, { useEffect } from 'react';
import { useTimer } from 'react-timer-hook';

interface TimerDisplayProps {
  expiryTimestamp: Date;
  onExpire: () => void;
  isActive: boolean;
  color: 'black' | 'white';
}

export const TimerDisplay = React.memo(({
  expiryTimestamp,
  onExpire,
  isActive,
  color
}: TimerDisplayProps) => {
  const {
    seconds,
    minutes,
    pause,
    resume,
  } = useTimer({
    expiryTimestamp,
    onExpire,
    autoStart: isActive
  });

  useEffect(() => {
    if (isActive) {
      resume();
    } else {
      pause();
    }
  }, [isActive, pause, resume]);

  const timeLeft = minutes * 60 + seconds;
  const isLowTime = timeLeft <= 10;

  return (
    <div className={`flex items-center gap-2 ${
      isActive && isLowTime ? 'animate-pulse' : ''
    }`}>
      <div className="flex items-center gap-1">
        <svg 
          className={`w-4 h-4 ${isActive ? 'text-red-400' : 'text-gray-400'}`} 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
        </svg>
        <span className={`font-mono font-bold ${
          isActive 
            ? isLowTime ? 'text-red-400' : 'text-white'
            : 'text-gray-400'
        }`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
});

TimerDisplay.displayName = 'TimerDisplay';
