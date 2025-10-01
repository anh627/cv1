// src/components/go-game/components/GoGame.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { produce } from 'immer';

// Import types và constants
import { 
  StoneType, Stone, GameMode, GameStatus, Position, 
  GameMove, Captures, GameScore, GameSettings 
} from '../types';
import { DEFAULT_SETTINGS, BOARD_SIZES } from '../constants';

// Import utils
import { 
  makeEmptyBoard, inBounds, tryPlay, generateStarPoints,
  getGroupAndLiberties 
} from '../utils/board';
import { pickAiMove } from '../utils/ai';
import { exportToSGF, importFromSGF } from '../utils/sgf';

// Import components
import { StoneComponent } from './StoneComponent';
import { BoardCell } from './BoardCell';
import { TimerDisplay } from './TimerDisplay';
import { TutorialModal } from './TutorialModal';
import { ScoreModal } from './ScoreModal';

const GoGame: React.FC = () => {
  // ========== TẤT CẢ STATE VÀ LOGIC GỐC ==========
  const [animatingCaptures, setAnimatingCaptures] = useState<Position[]>([]);
  const [gameMode, setGameMode] = useState<GameMode>('local');
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [board, setBoard] = useState<StoneType[][]>(() => makeEmptyBoard(settings.boardSize));
  const [currentPlayer, setCurrentPlayer] = useState<StoneType>(Stone.BLACK);
  const [captures, setCaptures] = useState<Captures>({ black: 0, white: 0 });
  const [moveHistory, setMoveHistory] = useState<GameMove[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [passCount, setPassCount] = useState(0);
  const [hoverPosition, setHoverPosition] = useState<Position | null>(null);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [gameScore, setGameScore] = useState<GameScore | null>(null);
  const [timerExpiry, setTimerExpiry] = useState<Date>(() => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + settings.timePerMove);
    return now;
  });
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  
  const koHistoryRef = useRef<StoneType[][] | null>(null);
  const aiMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const boardHistoryRef = useRef<StoneType[][][]>([]);

  const getAIColor = useCallback((): StoneType => {
    return settings.humanColor === 'black' ? Stone.WHITE : Stone.BLACK;
  }, [settings.humanColor]);

  const initializeGame = useCallback(() => {
    const newBoard = makeEmptyBoard(settings.boardSize);
    setBoard(newBoard);
    setCurrentPlayer(Stone.BLACK);
    setCaptures({ black: 0, white: 0 });
    setMoveHistory([]);
    setGameStatus('playing');
    setPassCount(0);
    setLastMove(null);
    setShowScore(false);
    setGameScore(null);
    setAnimatingCaptures([]);
    setTimerExpiry(() => {
      const now = new Date();
      now.setSeconds(now.getSeconds() + settings.timePerMove);
      return now;
    });
    setIsTimerActive(true);
    koHistoryRef.current = null;
    boardHistoryRef.current = [];
    
    if (gameMode === 'ai' && settings.humanColor === 'white') {
      setTimeout(() => handleAIMove(), 500);
    }
  }, [settings.boardSize, settings.humanColor, settings.timePerMove, gameMode]);

  const cleanup = useCallback(() => {
    if (aiMoveTimeoutRef.current) {
      clearTimeout(aiMoveTimeoutRef.current);
      aiMoveTimeoutRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const isValidMove = useCallback((position: Position): boolean => {
    const { x, y } = position;
    if (!inBounds(x, y, board.length) || board[y][x] !== Stone.EMPTY || gameStatus !== 'playing') {
      return false;
    }
    if (gameMode === 'ai' && currentPlayer === getAIColor()) {
      return false;
    }
    const result = tryPlay(board, x, y, currentPlayer, koHistoryRef.current);
    return result.legal;
  }, [board, gameStatus, currentPlayer, gameMode, getAIColor]);

  const calculateTerritory = useCallback((): { black: number; white: number } => {
    const size = board.length;
    const visited = new Set<string>();
    let blackTerritory = 0;
    let whiteTerritory = 0;

    const floodFill = (startX: number, startY: number): { owner: StoneType } => {
      if (visited.has(`${startX},${startY}`) || board[startY][startX] !== Stone.EMPTY) {
        return { owner: Stone.EMPTY };
      }

      const queue: Position[] = [{ x: startX, y: startY }];
      const territory: Position[] = [];
      const borderStones = new Set<StoneType>();

      while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.x},${current.y}`;
        
        if (visited.has(key)) continue;
        visited.add(key);
        territory.push(current);

        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
          if (!inBounds(neighbor.x, neighbor.y, size)) continue;
          
          const neighborStone = board[neighbor.y][neighbor.x];
          if (neighborStone === Stone.EMPTY && !visited.has(`${neighbor.x},${neighbor.y}`)) {
            queue.push(neighbor);
          } else if (neighborStone !== Stone.EMPTY) {
            borderStones.add(neighborStone);
          }
        }
      }

      if (borderStones.size === 1) {
        const owner = Array.from(borderStones)[0];
        if (owner === Stone.BLACK) {
          blackTerritory += territory.length;
        } else {
          whiteTerritory += territory.length;
        }
        return { owner };
      }

      return { owner: Stone.EMPTY };
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!visited.has(`${x},${y}`) && board[y][x] === Stone.EMPTY) {
          floodFill(x, y);
        }
      }
    }

    return { black: blackTerritory, white: whiteTerritory };
  }, [board]);

  const calculateScore = useCallback((): GameScore => {
    const territory = calculateTerritory();
    const blackScore = territory.black + captures.black;
    const whiteScore = territory.white + captures.white + settings.komi;
    const winner = blackScore > whiteScore ? 'black' : whiteScore > blackScore ? 'white' : 'draw';
    
    return {
      blackScore,
      whiteScore,
      blackTerritory: territory.black,
      whiteTerritory: territory.white,
      komi: settings.komi,
      winner
    };
  }, [board, captures, settings.komi, calculateTerritory]);

  const handleAIMove = useCallback(() => {
    if (gameStatus !== 'playing' || currentPlayer !== getAIColor()) return;
    
    setIsLoadingAI(true);
    aiMoveTimeoutRef.current = setTimeout(() => {
      try {
        const aiMove = pickAiMove(board, currentPlayer, settings.difficulty, koHistoryRef.current);
        setIsLoadingAI(false);
        
        if (aiMove && aiMove.x !== -1) {
          handlePlaceStone(aiMove);
        } else {
          handlePass();
        }
      } catch (error) {
        console.error('AI move error:', error);
        setIsLoadingAI(false);
        alert('Lỗi khi AI tính toán nước đi. Vui lòng thử lại.');
      }
    }, 100);
  }, [board, currentPlayer, gameStatus, settings.difficulty, getAIColor]);

  const handlePlaceStone = useCallback((position: Position) => {
    if (!isValidMove(position) && !(gameMode === 'ai' && currentPlayer === getAIColor())) return;
    
    const result = tryPlay(board, position.x, position.y, currentPlayer, koHistoryRef.current);
    if (!result.legal || !result.board) return;

    boardHistoryRef.current = [...boardHistoryRef.current, board];
    koHistoryRef.current = result.captures === 1 ? board : null;
    
    setBoard(result.board);
    setLastMove(position);
    
    if (result.captures && result.captures > 0) {
      setCaptures(prev => ({
        ...prev,
        [currentPlayer === Stone.BLACK ? 'black' : 'white']: 
          prev[currentPlayer === Stone.BLACK ? 'black' : 'white'] + result.captures!
      }));
      
      if (result.capturedPositions) {
        setAnimatingCaptures(result.capturedPositions);
        animationFrameRef.current = requestAnimationFrame(() => {
          setTimeout(() => setAnimatingCaptures([]), 600);
        });
      }
    }
    
    const newMove: GameMove = {
      player: currentPlayer,
      position,
      timestamp: Date.now(),
      captures: result.captures || 0,
      boardState: produce(result.board, draft => draft)
    };
    
    setMoveHistory(prev => [...prev, newMove]);
    const nextPlayer: StoneType = currentPlayer === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
    setCurrentPlayer(nextPlayer);
    setPassCount(0);
    
    setTimerExpiry(() => {
      const now = new Date();
      now.setSeconds(now.getSeconds() + settings.timePerMove);
      return now;
    });
    
    if (gameMode === 'ai' && nextPlayer === getAIColor()) {
      handleAIMove();
    }
  }, [board, currentPlayer, gameMode, isValidMove, settings.timePerMove, getAIColor, handleAIMove]);

  const handlePass = useCallback(() => {
    const newPassCount = passCount + 1;
    setPassCount(newPassCount);
    
    const passMove: GameMove = {
      player: currentPlayer,
      position: { x: -1, y: -1 },
      timestamp: Date.now(),
      captures: 0,
      isPass: true,
      boardState: produce(board, draft => draft)
    };
    
    setMoveHistory(prev => [...prev, passMove]);
    
    if (newPassCount >= 2) {
      setGameStatus('finished');
      const finalScore = calculateScore();
      setGameScore(finalScore);
      setShowScore(true);
      setIsTimerActive(false);
    } else {
      const nextPlayer: StoneType = currentPlayer === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
      setCurrentPlayer(nextPlayer);
      
      setTimerExpiry(() => {
        const now = new Date();
        now.setSeconds(now.getSeconds() + settings.timePerMove);
        return now;
      });
      
      if (gameMode === 'ai' && nextPlayer === getAIColor()) {
        handleAIMove();
      }
    }
  }, [passCount, currentPlayer, board, gameMode, calculateScore, settings.timePerMove, getAIColor, handleAIMove]);

  const handleUndo = useCallback(() => {
    if (moveHistory.length === 0) return;
    
    const movesToUndo = gameMode === 'ai' ? 2 : 1;
    const actualMovesToUndo = Math.min(movesToUndo, moveHistory.length);
    
    const newHistory = moveHistory.slice(0, -actualMovesToUndo);
    setMoveHistory(newHistory);
    
    const previousBoard = boardHistoryRef.current[boardHistoryRef.current.length - actualMovesToUndo] || 
                         makeEmptyBoard(settings.boardSize);
    setBoard(previousBoard);
    
    setLastMove(newHistory.length > 0 && !newHistory[newHistory.length - 1].isPass ? 
                newHistory[newHistory.length - 1].position : null);
    
    let blackCaptures = 0;
    let whiteCaptures = 0;
    for (const move of newHistory) {
      if (move.player === Stone.BLACK) blackCaptures += move.captures;
      else whiteCaptures += move.captures;
    }
    setCaptures({ black: blackCaptures, white: whiteCaptures });
    
    setCurrentPlayer(newHistory.length > 0 ? 
      (newHistory[newHistory.length - 1].player === Stone.BLACK ? Stone.WHITE : Stone.BLACK) : 
      Stone.BLACK);
    
    setPassCount(newHistory.slice(-2).filter(m => m.isPass).length);
    setGameStatus('playing');
    setShowScore(false);
    koHistoryRef.current = null;
    boardHistoryRef.current = boardHistoryRef.current.slice(0, -actualMovesToUndo);
    
    setTimerExpiry(() => {
      const now = new Date();
      now.setSeconds(now.getSeconds() + settings.timePerMove);
      return now;
    });
  }, [moveHistory, gameMode, settings.boardSize, settings.timePerMove]);

  const saveGame = useCallback(() => {
    try {
      const sgf = exportToSGF(moveHistory, settings, gameScore || undefined);
      const blob = new Blob([sgf], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `go_game_${new Date().toISOString().replace(/[:.]/g, '-')}.sgf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Save game error:', error);
      alert('Lỗi khi lưu ván cờ. Vui lòng thử lại.');
    }
  }, [moveHistory, settings, gameScore]);

  const loadGame = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      const gameData = importFromSGF(content);
      if (!gameData) return;
      
      try {
        setSettings(prev => ({ 
          ...prev, 
          boardSize: gameData.boardSize, 
          komi: gameData.komi 
        }));
        
        const newBoard = makeEmptyBoard(gameData.boardSize);
        let currentBoard = newBoard;
        let currentCaptures = { black: 0, white: 0 };
        let koBoard: StoneType[][] | null = null;
        const newMoveHistory: GameMove[] = [];
        
        for (const move of gameData.moves) {
          if (move.position.x === -1 && move.position.y === -1) {
            const passMove: GameMove = {
              player: move.player,
              position: move.position,
              timestamp: Date.now(),
              captures: 0,
              isPass: true,
              boardState: produce(currentBoard, draft => draft)
            };
            newMoveHistory.push(passMove);
          } else {
            const result = tryPlay(currentBoard, move.position.x, move.position.y, move.player, koBoard);
            if (!result.legal || !result.board) continue;
            
            currentBoard = result.board;
            if (result.captures && result.captures > 0) {
              currentCaptures[move.player === Stone.BLACK ? 'black' : 'white'] += result.captures;
            }
            koBoard = result.captures === 1 ? currentBoard : null;
            
            const gameMove: GameMove = {
              player: move.player,
              position: move.position,
              timestamp: Date.now(),
              captures: result.captures || 0,
              boardState: produce(currentBoard, draft => draft)
            };
            newMoveHistory.push(gameMove);
            boardHistoryRef.current.push(currentBoard);
          }
        }
        
        setBoard(currentBoard);
        setCaptures(currentCaptures);
        setMoveHistory(newMoveHistory);
        
        const lastMove = newMoveHistory[newMoveHistory.length - 1];
        setCurrentPlayer(lastMove ? 
          (lastMove.player === Stone.BLACK ? Stone.WHITE : Stone.BLACK) : 
          Stone.BLACK);
        setLastMove(lastMove && !lastMove.isPass ? lastMove.position : null);
        setPassCount(newMoveHistory.slice(-2).filter(m => m.isPass).length);
        setGameStatus('playing');
        setShowScore(false);
        koHistoryRef.current = koBoard;
        
        event.target.value = '';
      } catch (error) {
        console.error('Load game error:', error);
        alert('Lỗi khi tải ván cờ. Vui lòng kiểm tra định dạng SGF.');
      }
    };
    
    reader.onerror = () => alert('Lỗi khi đọc file. Vui lòng thử lại.');
    reader.readAsText(file);
  }, []);

  // Fix: Reset game when board size changes
  useEffect(() => {
    const newBoard = makeEmptyBoard(settings.boardSize);
    setBoard(newBoard);
    setCurrentPlayer(Stone.BLACK);
    setCaptures({ black: 0, white: 0 });
    setMoveHistory([]);
    setGameStatus('playing');
    setPassCount(0);
    setLastMove(null);
    setShowScore(false);
    setGameScore(null);
    setAnimatingCaptures([]);
    koHistoryRef.current = null;
    boardHistoryRef.current = [];
  }, [settings.boardSize]);

  useEffect(() => {
    initializeGame();
    return cleanup;
  }, [initializeGame, cleanup]);

  useEffect(() => {
    if (gameMode === 'ai' && currentPlayer === getAIColor() && gameStatus === 'playing') {
      handleAIMove();
    }
  }, [gameMode, currentPlayer, gameStatus, getAIColor, handleAIMove]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') handlePass();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 't' || e.key === 'T') setShowTutorial(true);
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handlePass, handleUndo]);

  // ========== RENDER BOARD (FIXED VERSION) ==========
  const renderBoard = useMemo(() => {
    const size = settings.boardSize;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
    
    const maxWidth = Math.min(windowWidth - 40, 600);
    const maxHeight = Math.min(windowHeight - 200, 600);
    const maxDisplaySize = Math.min(maxWidth, maxHeight);
    
    const baseCellSize = maxDisplaySize / (size - 1);
    const cellSize = Math.max(baseCellSize, 20);
    const actualDisplaySize = cellSize * (size - 1);
    const padding = cellSize / 2;
    
    const starPoints = generateStarPoints(size);

    return (
      <div
        className="relative rounded-xl shadow-2xl mx-auto transform transition-transform duration-300 hover:scale-[1.01]"
        style={{
          width: actualDisplaySize + padding * 2,
          height: actualDisplaySize + padding * 2,
          background: 'linear-gradient(135deg, #d2b48c 0%, #e6c088 50%, #d2b48c 100%)',
          padding,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: actualDisplaySize + padding * 2, height: actualDisplaySize + padding * 2 }}
        >
          {Array.from({ length: size }).map((_, index) => (
            <line
              key={`h-${index}`}
              x1={padding}
              y1={padding + index * cellSize}
              x2={padding + actualDisplaySize}
              y2={padding + index * cellSize}
              stroke="#5c4033"
              strokeWidth={size <= 9 ? "1" : "1.5"}
              opacity="0.9"
            />
          ))}
          {Array.from({ length: size }).map((_, index) => (
            <line
              key={`v-${index}`}
              x1={padding + index * cellSize}
              y1={padding}
              x2={padding + index * cellSize}
              y2={padding + actualDisplaySize}
              stroke="#5c4033"
              strokeWidth={size <= 9 ? "1" : "1.5"}
              opacity="0.9"
            />
          ))}
          {starPoints.map((point, index) => (
            <circle
              key={`star-${index}`}
              cx={padding + point.x * cellSize}
              cy={padding + point.y * cellSize}
              r={Math.max(cellSize * 0.1, 2)}
              fill="#5c4033"
            />
          ))}
        </svg>
        
        <div 
          className="absolute inset-0"
          style={{ 
            padding,
            pointerEvents: 'none' 
          }}
        >
          {board.map((row, y) =>
            row.map((stone, x) => {
              const isLastMovePosition = lastMove?.x === x && lastMove?.y === y;
              const isAnimating = animatingCaptures.some(pos => pos.x === x && pos.y === y);
              const isHovered = hoverPosition?.x === x && hoverPosition?.y === y;
              
              return (
                <div
                  key={`cell-${x}-${y}`}
                  style={{
                    position: 'absolute',
                    left: x * cellSize - cellSize / 2,
                    top: y * cellSize - cellSize / 2,
                    width: cellSize,
                    height: cellSize,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isValidMove({ x, y }) ? 'pointer' : 'default',
                    pointerEvents: 'auto',
                    zIndex: stone !== Stone.EMPTY ? 20 : 10,
                  }}
                  onMouseEnter={() => setHoverPosition({ x, y })}
                  onMouseLeave={() => setHoverPosition(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isValidMove({ x, y })) {
                      handlePlaceStone({ x, y });
                    }
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isValidMove({ x, y })) {
                      handlePlaceStone({ x, y });
                    }
                  }}
                >
                  {stone !== Stone.EMPTY && (
                    <StoneComponent
                      stone={stone}
                      size={cellSize < 30 ? 'small' : cellSize < 40 ? 'medium' : 'large'}
                      isLastMove={isLastMovePosition}
                      isAnimating={isAnimating}
                    />
                  )}
                  {isValidMove({ x, y }) && isHovered && stone === Stone.EMPTY && (
                    <div 
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        width: cellSize * 0.8,
                        height: cellSize * 0.8,
                        backgroundColor: currentPlayer === Stone.BLACK ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
        
        {isLoadingAI && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-xl z-50">
            <div className="bg-white px-4 py-2 rounded-lg shadow-lg animate-pulse flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-800">AI đang tính toán...</span>
            </div>
          </div>
        )}
      </div>
    );
  }, [
    board, 
    settings.boardSize, 
    hoverPosition, 
    lastMove,
    isValidMove, 
    handlePlaceStone, 
    isLoadingAI, 
    animatingCaptures,
    currentPlayer
  ]);

  // ========== PHẦN UI MỚI - PREMIUM DESIGN ==========
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Background Pattern */}
      <div className="fixed inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes glow {
            0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.5); }
            50% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.8); }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .float-animation { animation: float 3s ease-in-out infinite; }
          .glow-animation { animation: glow 2s ease-in-out infinite; }
          .slide-in { animation: slideIn 0.3s ease-out; }
          .glass-effect {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .neo-shadow {
            box-shadow: 
              0 10px 40px rgba(0, 0, 0, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
          }
          @keyframes place-stone {
            0% { transform: scale(0.5); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          .animate-place-stone { animation: place-stone 0.3s ease-out; }
          .shadow-stone-black {
            box-shadow: 
              2px 2px 6px rgba(0,0,0,0.7), 
              inset -2px -2px 4px rgba(255,255,255,0.1),
              0 0 10px rgba(0,0,0,0.3);
          }
          .shadow-stone-white {
            box-shadow: 
              2px 2px 6px rgba(0,0,0,0.4), 
              inset -2px -2px 4px rgba(0,0,0,0.1),
              0 0 10px rgba(255,255,255,0.5);
          }
        `}
      </style>

      <div className="relative z-10 max-w-8xl mx-auto p-4 sm:p-6">
        {/* Premium Header */}
        <header className="glass-effect rounded-2xl p-4 sm:p-6 mb-6 neo-shadow">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center glow-animation">
                  <span className="text-2xl sm:text-3xl">♟️</span>
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                  Go Master Pro
                </h1>
                <p className="text-xs sm:text-sm text-gray-400">Professional Go Game Experience</p>
              </div>
            </div>

            {/* Game Status Bar */}
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-3 glass-effect rounded-xl px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full float-animation ${
                    currentPlayer === Stone.BLACK
                      ? 'bg-gradient-to-br from-gray-800 to-black shadow-stone-black'
                      : 'bg-gradient-to-br from-white to-gray-200 shadow-stone-white'
                  }`} />
                  <div className="text-white">
                    <div className="text-xs text-gray-400">Current</div>
                    <div className="font-bold">{currentPlayer === Stone.BLACK ? 'Black' : 'White'}</div>
                  </div>
                </div>
                <div className="w-px h-8 bg-gray-600" />
                <div className="text-white">
                  <div className="text-xs text-gray-400">Move</div>
                  <div className="font-bold">#{moveHistory.length}</div>
                </div>
              </div>

              {/* Timer with modern design */}
              <div className={`glass-effect rounded-xl px-4 py-2 ${
                isTimerActive ? 'border-red-500' : 'border-gray-500'
              }`}>
                <TimerDisplay
                  expiryTimestamp={timerExpiry}
                  onExpire={() => {
                    handlePass();
                    alert(`${currentPlayer === Stone.BLACK ? 'Black' : 'White'} timeout!`);
                  }}
                  isActive={isTimerActive && gameStatus === 'playing'}
                  color={currentPlayer === Stone.BLACK ? 'black' : 'white'}
                />
              </div>

              <button
                onClick={() => setShowTutorial(true)}
                className="p-3 glass-effect rounded-xl hover:bg-white/20 transition-all duration-200 group"
                aria-label="Tutorial"
              >
                <svg className="w-5 h-5 text-purple-400 group-hover:text-purple-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main Game Area */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left Sidebar - Game Controls */}
          <div className="xl:col-span-3 space-y-4 order-2 xl:order-1">
            {/* Game Mode Selector */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">🎮</span> Game Mode
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGameMode('local')}
                  className={`py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                    gameMode === 'local'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white neo-shadow transform scale-105'
                      : 'glass-effect text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <span className="block text-lg mb-1">👥</span>
                  <span className="text-xs">Local</span>
                </button>
                <button
                  onClick={() => setGameMode('ai')}
                  className={`py-3 px-4 rounded-xl font-semibold transition-all duration-200 ${
                    gameMode === 'ai'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white neo-shadow transform scale-105'
                      : 'glass-effect text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <span className="block text-lg mb-1">🤖</span>
                  <span className="text-xs">vs AI</span>
                </button>
              </div>
            </div>

            {/* Statistics */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">📊</span> Statistics
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Captured</span>
                  <div className="flex gap-3">
                    <span className="text-white font-mono">⚫ {captures.black}</span>
                    <span className="text-white font-mono">⚪ {captures.white}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Territory</span>
                  <button 
                    onClick={() => {
                      const score = calculateScore();
                      setGameScore(score);
                      setShowScore(true);
                    }}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium"
                  >
                    Calculate →
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Komi</span>
                  <span className="text-white font-mono">{settings.komi}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Pass Count</span>
                  <span className="text-white font-mono">{passCount}/2</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">⚡</span> Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handlePass}
                  disabled={gameStatus !== 'playing'}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-yellow-600 to-orange-600 text-white font-medium hover:from-yellow-700 hover:to-orange-700 disabled:from-gray-600 disabled:to-gray-700 transition-all duration-200 neo-shadow"
                >
                  Pass
                </button>
                <button
                  onClick={handleUndo}
                  disabled={moveHistory.length === 0}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-600 disabled:to-gray-700 transition-all duration-200 neo-shadow"
                >
                  Undo
                </button>
                <button
                  onClick={initializeGame}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 text-white font-medium hover:from-red-700 hover:to-pink-700 transition-all duration-200 neo-shadow"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    const score = calculateScore();
                    setGameScore(score);
                    setShowScore(true);
                    setIsTimerActive(false);
                  }}
                  className="py-2 px-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium hover:from-green-700 hover:to-emerald-700 transition-all duration-200 neo-shadow"
                >
                  Score
                </button>
              </div>
            </div>
          </div>

          {/* Center - Game Board */}
          <div className="xl:col-span-6 order-1 xl:order-2">
            <div className="glass-effect rounded-2xl p-4 sm:p-6 neo-shadow">
              <div className="flex justify-center">
                {renderBoard}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Settings */}
          <div className="xl:col-span-3 space-y-4 order-3">
            {/* Settings Panel */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">⚙️</span> Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Board Size</label>
                  <select
                    value={settings.boardSize}
                    onChange={(e) => setSettings(prev => ({ ...prev, boardSize: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:border-purple-400 focus:outline-none transition-colors"
                  >
                    {BOARD_SIZES.map(size => (
                      <option key={size} value={size} className="bg-gray-800">
                        {size}×{size}
                      </option>
                    ))}
                  </select>
                </div>

                {gameMode === 'ai' && (
                  <>
                    <div>
                      <label className="text-gray-400 text-sm block mb-2">AI Difficulty</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['easy', 'medium', 'hard'] as const).map(level => (
                          <button
                            key={level}
                            onClick={() => setSettings(prev => ({ ...prev, difficulty: level }))}
                            className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                              settings.difficulty === level
                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                                : 'glass-effect text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            {level === 'easy' ? '🟢 Easy' : level === 'medium' ? '🟡 Med' : '🔴 Hard'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-gray-400 text-sm block mb-2">Play as</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, humanColor: 'black' }))}
                          className={`py-2 px-3 rounded-xl font-medium transition-all ${
                            settings.humanColor === 'black'
                              ? 'bg-gradient-to-r from-gray-800 to-black text-white'
                              : 'glass-effect text-gray-300 hover:bg-white/20'
                          }`}
                        >
                          ⚫ Black
                        </button>
                        <button
                          onClick={() => setSettings(prev => ({ ...prev, humanColor: 'white' }))}
                          className={`py-2 px-3 rounded-xl font-medium transition-all ${
                            settings.humanColor === 'white'
                              ? 'bg-gradient-to-r from-gray-100 to-white text-black'
                              : 'glass-effect text-gray-300 hover:bg-white/20'
                          }`}
                        >
                          ⚪ White
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-gray-400 text-sm block mb-2">
                    Time per Move
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="300"
                    value={settings.timePerMove}
                    onChange={(e) => setSettings(prev => ({ ...prev, timePerMove: Number(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="text-white text-center text-sm mt-1">
                    {settings.timePerMove}s
                  </div>
                </div>
              </div>
            </div>

            {/* Save/Load Panel */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">💾</span> Game Data
              </h3>
              <div className="space-y-2">
                <button
                  onClick={saveGame}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-medium hover:from-purple-700 hover:to-violet-700 transition-all duration-200 neo-shadow flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/>
                    <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/>
                  </svg>
                  Export SGF
                </button>
                <label className="block">
                  <input
                    type="file"
                    accept=".sgf"
                    onChange={loadGame}
                    className="hidden"
                  />
                  <div className="w-full py-2 px-3 rounded-xl glass-effect text-gray-300 font-medium hover:bg-white/20 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z"/>
                      <path d="M3 5a2 2 0 012-2 1 1 0 000 2H5v7h2l1 2h4l1-2h2V5h2a1 1 0 100-2 2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2z"/>
                    </svg>
                    Import SGF
                  </div>
                </label>
              </div>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="glass-effect rounded-2xl p-4 neo-shadow slide-in">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span className="text-xl">⌨️</span> Shortcuts
              </h3>
              <div className="space-y-2 text-sm">
                {[
                  { key: 'P', action: 'Pass' },
                  { key: 'Ctrl+Z', action: 'Undo' },
                  { key: 'T', action: 'Tutorial' },
                  { key: 'N', action: 'New Game' },
                ].map(({ key, action }) => (
                  <div key={key} className="flex justify-between text-gray-400">
                    <kbd className="px-2 py-1 rounded bg-white/10 text-white font-mono text-xs">
                      {key}
                    </kbd>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="mt-6 glass-effect rounded-2xl p-3 neo-shadow">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span>Game Status: {gameStatus === 'playing' ? 'Active' : 'Finished'}</span>
            </div>
            <div className="text-gray-400">|</div>
            <div className="text-gray-400">
              Mode: {gameMode === 'ai' ? `AI (${settings.difficulty})` : 'Local PvP'}
            </div>
            <div className="text-gray-400">|</div>
            <div className="text-gray-400">
              Board: {settings.boardSize}×{settings.boardSize}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
      <ScoreModal
        isOpen={showScore}
        gameScore={gameScore}
        captures={captures}
        onClose={() => setShowScore(false)}
        onNewGame={() => {
          setShowScore(false);
          initializeGame();
        }}
      />
    </div>
  );
};

export default GoGame;
