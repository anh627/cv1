// src/components/go-game/components/ScoreModal.tsx

import React from 'react';
import { GameScore, Captures } from '../types';

interface ScoreModalProps {
  isOpen: boolean;
  gameScore: GameScore | null;
  captures: Captures;
  onClose: () => void;
  onNewGame: () => void;
}

export const ScoreModal = React.memo(({
  isOpen,
  gameScore,
  captures,
  onClose,
  onNewGame
}: ScoreModalProps) => {
  if (!isOpen || !gameScore) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6 sm:p-8 rounded-3xl max-w-md w-full border border-purple-500/30 shadow-2xl">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
            Game Results
          </h2>
          <div className="text-6xl mb-4">
            {gameScore.winner === 'black' ? '⚫' : gameScore.winner === 'white' ? '⚪' : '🤝'}
          </div>
          <div className={`text-2xl font-bold ${
            gameScore.winner === 'draw'
              ? 'text-yellow-400'
              : gameScore.winner === 'black'
              ? 'text-gray-300'
              : 'text-white'
          }`}>
            {gameScore.winner === 'draw' ? 'DRAW!' : `${gameScore.winner.toUpperCase()} WINS!`}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
              <div className="text-gray-400 text-xs mb-1">Black Territory</div>
              <div className="text-white font-bold text-lg">{gameScore.blackTerritory}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
              <div className="text-gray-400 text-xs mb-1">White Territory</div>
              <div className="text-white font-bold text-lg">{gameScore.whiteTerritory}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
              <div className="text-gray-400 text-xs mb-1">Black Captures</div>
              <div className="text-white font-bold text-lg">{captures.black}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
              <div className="text-gray-400 text-xs mb-1">White Captures</div>
              <div className="text-white font-bold text-lg">{captures.white}</div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="text-gray-400 text-xs mb-1">Komi</div>
            <div className="text-white font-bold text-lg">{gameScore.komi}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/20">
            <div className="bg-gradient-to-r from-gray-800 to-black rounded-xl p-4">
              <div className="text-gray-400 text-xs mb-1">Black Total</div>
              <div className="text-white font-black text-2xl">{gameScore.blackScore.toFixed(1)}</div>
            </div>
            <div className="bg-gradient-to-r from-gray-100 to-white rounded-xl p-4">
              <div className="text-gray-600 text-xs mb-1">White Total</div>
              <div className="text-black font-black text-2xl">{gameScore.whiteScore.toFixed(1)}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/10 backdrop-blur text-white rounded-xl hover:bg-white/20 transition-all duration-200 font-semibold border border-white/20"
          >
            Close
          </button>
          <button
            onClick={onNewGame}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 font-semibold shadow-lg"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  );
});

ScoreModal.displayName = 'ScoreModal';
