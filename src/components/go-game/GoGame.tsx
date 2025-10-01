import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ==================== TYPES ====================
const Stone = { EMPTY: 0, BLACK: 1, WHITE: 2 };

// ==================== CONSTANTS ====================
const BOARD_SIZES = [9, 13, 19];
const DEFAULT_SETTINGS = {
  boardSize: 9,
  komi: 6.5,
  difficulty: 'medium',
  timePerMove: 60,
  humanColor: 'black'
};

const TUTORIAL_STEPS = [
  {
    title: 'Đặt quân',
    text: 'Click vào giao điểm trống để đặt quân. Mỗi quân cần ít nhất 1 "khí" (ô trống kề bên) để tồn tại.',
    tip: 'Với AI easy, hãy đặt quân ở góc bàn cờ để dễ dàng mở rộng lãnh thổ.'
  },
  {
    title: 'Bắt quân',
    text: 'Bắt quân đối thủ bằng cách bao vây và chặn hết tất cả "khí" của nhóm quân.',
    tip: 'AI medium có thể phản công, hãy cẩn thận bảo vệ quân của mình!'
  },
  {
    title: 'Luật Ko',
    text: 'Không được đặt quân tạo ra trạng thái bàn cờ lặp lại ngay lập tức.',
    tip: 'Hãy đi một nước khác trước khi quay lại lấy quân.'
  },
  {
    title: 'Pass & Kết thúc',
    text: 'Nhấn Pass khi không còn nước đi tốt. Hai lần pass liên tiếp sẽ kết thúc ván đấu.',
    tip: 'Hãy chắc chắn bạn đã bảo vệ vùng đất của mình trước khi pass!'
  },
  {
    title: 'Tính điểm',
    text: 'Điểm = Vùng đất kiểm soát + Quân đối thủ bắt được + Komi (6.5 điểm cho trắng).',
    tip: 'Tạo "mắt" (empty space bao quanh) để bảo vệ vùng đất không bị tấn công.'
  }
];

// ==================== UTILITY FUNCTIONS ====================
const makeEmptyBoard = (size) => 
  Array.from({ length: size }, () => Array(size).fill(Stone.EMPTY));

const copyBoard = (board) => board.map(row => [...row]);

const inBounds = (x, y, size) => x >= 0 && y >= 0 && x < size && y < size;

const getNeighbors = (x, y, size) =>
  [[1,0],[-1,0],[0,1],[0,-1]]
    .map(([dx,dy]) => ({x: x+dx, y: y+dy}))
    .filter(pos => inBounds(pos.x, pos.y, size));

const getGroupAndLiberties = (board, x, y) => {
  const color = board[y][x];
  if (color === Stone.EMPTY) return { group: [], liberties: new Set() };
  
  const visited = new Set();
  const liberties = new Set();
  const group = [];
  const stack = [{x, y}];
  visited.add(`${x},${y}`);
  
  while (stack.length > 0) {
    const curr = stack.pop();
    group.push(curr);
    
    for (const n of getNeighbors(curr.x, curr.y, board.length)) {
      const nColor = board[n.y][n.x];
      const key = `${n.x},${n.y}`;
      if (nColor === Stone.EMPTY) {
        liberties.add(key);
      } else if (nColor === color && !visited.has(key)) {
        visited.add(key);
        stack.push(n);
      }
    }
  }
  
  return { group, liberties };
};

const tryPlay = (board, x, y, color, koBoard) => {
  if (!inBounds(x, y, board.length) || board[y][x] !== Stone.EMPTY) 
    return { legal: false };
  
  const newBoard = copyBoard(board);
  newBoard[y][x] = color;
  
  let totalCaptures = 0;
  const capturedPositions = [];
  const opponent = color === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
  
  for (const n of getNeighbors(x, y, board.length)) {
    if (newBoard[n.y][n.x] === opponent) {
      const { group, liberties } = getGroupAndLiberties(newBoard, n.x, n.y);
      if (liberties.size === 0) {
        totalCaptures += group.length;
        group.forEach(pos => {
          newBoard[pos.y][pos.x] = Stone.EMPTY;
          capturedPositions.push(pos);
        });
      }
    }
  }
  
  const { liberties } = getGroupAndLiberties(newBoard, x, y);
  if (liberties.size === 0 && totalCaptures === 0) return { legal: false };
  
  if (koBoard) {
    let isSame = true;
    for (let i = 0; i < board.length && isSame; i++) {
      for (let j = 0; j < board.length; j++) {
        if (newBoard[i][j] !== koBoard[i][j]) {
          isSame = false;
          break;
        }
      }
    }
    if (isSame) return { legal: false };
  }
  
  return { legal: true, board: newBoard, captures: totalCaptures, capturedPositions };
};

const generateStarPoints = (size) => {
  const points = [];
  const edge = size <= 9 ? 2 : 3;
  const center = Math.floor(size / 2);
  const far = size - edge - 1;
  
  if (size >= 9) {
    points.push(
      { x: edge, y: edge },
      { x: edge, y: far },
      { x: far, y: edge },
      { x: far, y: far }
    );
  }
  
  if (size >= 13) {
    points.push(
      { x: edge, y: center },
      { x: far, y: center },
      { x: center, y: edge },
      { x: center, y: far }
    );
  }
  
  if (size >= 9) {
    points.push({ x: center, y: center });
  }
  
  return points;
};

const pickAiMove = (board, color, difficulty, koBoard) => {
  const size = board.length;
  const relevantPositions = [];
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== Stone.EMPTY) {
        const maxDist = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;
        for (let dy = -maxDist; dy <= maxDist; dy++) {
          for (let dx = -maxDist; dx <= maxDist; dx++) {
            const nx = x + dx, ny = y + dy;
            if (inBounds(nx, ny, size) && board[ny][nx] === Stone.EMPTY) {
              relevantPositions.push({x: nx, y: ny});
            }
          }
        }
      }
    }
  }
  
  if (relevantPositions.length < 10) {
    const center = Math.floor(size / 2);
    const strategic = [
      { x: center, y: center },
      { x: 3, y: 3 }, { x: size - 4, y: 3 },
      { x: 3, y: size - 4 }, { x: size - 4, y: size - 4 }
    ];
    strategic.forEach(pos => {
      if (inBounds(pos.x, pos.y, size) && board[pos.y][pos.x] === Stone.EMPTY) {
        relevantPositions.push(pos);
      }
    });
  }
  
  const unique = relevantPositions.filter((pos, i, arr) => 
    arr.findIndex(p => p.x === pos.x && p.y === pos.y) === i
  );
  
  const candidates = unique
    .map(pos => {
      const result = tryPlay(board, pos.x, pos.y, color, koBoard);
      if (!result.legal) return null;
      
      const captures = result.captures || 0;
      const neighbors = getNeighbors(pos.x, pos.y, size);
      const friendlyNeighbors = neighbors.filter(n => board[n.y][n.x] === color).length;
      const centerDist = Math.abs(Math.floor(size/2) - pos.x) + Math.abs(Math.floor(size/2) - pos.y);
      
      let score = captures * 25 + friendlyNeighbors * 10 - centerDist * 2 + Math.random() * 8;
      
      if (difficulty === 'easy') {
        score += Math.random() * 20;
      } else if (difficulty === 'hard') {
        if ((pos.x === 0 || pos.x === size-1) && (pos.y === 0 || pos.y === size-1)) score += 15;
        else if (pos.x === 0 || pos.x === size-1 || pos.y === 0 || pos.y === size-1) score += 8;
      }
      
      return { position: pos, score };
    })
    .filter(Boolean);
  
  if (candidates.length === 0) return {x: -1, y: -1};
  
  candidates.sort((a, b) => b.score - a.score);
  const topCount = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 3 : 2;
  const selected = candidates[Math.floor(Math.random() * Math.min(topCount, candidates.length))];
  
  return selected.position;
};

// ==================== COMPONENTS ====================
const StoneComponent = ({ stone, size, isLastMove, isAnimating }) => {
  if (stone === Stone.EMPTY) return null;
  
  const sizeClass = size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-8 h-8';
  
  return (
    <div className={`${sizeClass} rounded-full transition-all duration-300 ${
      stone === Stone.BLACK 
        ? 'bg-gradient-to-br from-gray-700 via-gray-900 to-black shadow-lg' 
        : 'bg-gradient-to-br from-white via-gray-50 to-gray-200 shadow-lg border-2 border-gray-300'
    } ${isLastMove ? 'ring-2 ring-red-500 ring-offset-1 animate-pulse' : ''} ${
      isAnimating ? 'animate-bounce' : ''
    }`}>
      <div className={`absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full ${
        stone === Stone.BLACK ? 'bg-gray-600 opacity-30' : 'bg-white opacity-60'
      }`} />
    </div>
  );
};

const TimerDisplay = ({ expiryTimestamp, onExpire, isActive, color }) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = expiryTimestamp.getTime() - now;
      
      if (distance < 0) {
        setTimeLeft(0);
        onExpire();
        clearInterval(interval);
      } else {
        setTimeLeft(Math.ceil(distance / 1000));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [expiryTimestamp, onExpire, isActive]);

  const isLowTime = timeLeft < 10;

  return (
    <div className={`text-center ${isLowTime ? 'animate-pulse' : ''}`}>
      <div className="text-xs text-gray-400">Time</div>
      <div className={`font-bold text-lg font-mono ${
        isLowTime ? 'text-red-400' : 'text-white'
      }`}>
        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
      </div>
    </div>
  );
};

const TutorialModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(0);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-white to-blue-50 p-8 rounded-3xl shadow-2xl max-w-lg w-full">
        <h2 className="text-3xl font-bold mb-4 text-gray-800">Hướng dẫn chơi</h2>
        <h3 className="text-xl font-semibold mb-3 text-blue-600">{TUTORIAL_STEPS[step].title}</h3>
        <p className="text-gray-700 mb-4 text-lg">{TUTORIAL_STEPS[step].text}</p>
        <p className="text-gray-600 mb-6 bg-yellow-50 p-3 rounded-xl border border-yellow-200">
          <strong>Mẹo:</strong> {TUTORIAL_STEPS[step].tip}
        </p>
        <div className="flex justify-between gap-3">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700"
          >
            Trước
          </button>
          <span className="flex items-center text-gray-600 font-medium">
            {step + 1} / {TUTORIAL_STEPS.length}
          </span>
          <button
            onClick={() => setStep(Math.min(TUTORIAL_STEPS.length - 1, step + 1))}
            disabled={step === TUTORIAL_STEPS.length - 1}
            className="px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700"
          >
            Tiếp
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

const ScoreModal = ({ isOpen, scoreData, captures, komi, onClose, onNewGame }) => {
  if (!isOpen || !scoreData) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-2xl max-w-md w-full">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Kết quả ván cờ</h2>
        <div className="space-y-4">
          <div className="bg-gray-800 text-white p-4 rounded-xl">
            <div className="flex justify-between mb-2">
              <span>Vùng đất Đen:</span>
              <span className="font-bold">{scoreData.blackTerritory}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Quân bắt Đen:</span>
              <span className="font-bold">{captures.black}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-600">
              <span className="font-bold">Tổng Đen:</span>
              <span className="text-2xl font-bold">{scoreData.blackScore.toFixed(1)}</span>
            </div>
          </div>
          
          <div className="bg-gray-100 text-gray-800 p-4 rounded-xl border-2 border-gray-300">
            <div className="flex justify-between mb-2">
              <span>Vùng đất Trắng:</span>
              <span className="font-bold">{scoreData.whiteTerritory}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Quân bắt Trắng:</span>
              <span className="font-bold">{captures.white}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>Komi:</span>
              <span className="font-bold">{komi}</span>
            </div>
            <div className="flex justify-between pt-2 border-t-2 border-gray-400">
              <span className="font-bold">Tổng Trắng:</span>
              <span className="text-2xl font-bold">{scoreData.whiteScore.toFixed(1)}</span>
            </div>
          </div>
          
          <div className={`text-center py-6 rounded-xl font-bold text-3xl shadow-lg ${
            scoreData.winner === 'draw'
              ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white'
              : scoreData.winner === 'black'
              ? 'bg-gradient-to-r from-gray-800 to-black text-white'
              : 'bg-gradient-to-r from-white to-gray-100 text-black border-4 border-gray-800'
          }`}>
            {scoreData.winner === 'draw' 
              ? 'HÒA!' 
              : `${scoreData.winner === 'black' ? 'ĐEN' : 'TRẮNG'} THẮNG!`}
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 font-bold transition-all"
          >
            Đóng
          </button>
          <button
            onClick={onNewGame}
            className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 font-bold transition-all"
          >
            Ván mới
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const GoGame = () => {
  const [gameMode, setGameMode] = useState('local');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [board, setBoard] = useState(() => makeEmptyBoard(settings.boardSize));
  const [currentPlayer, setCurrentPlayer] = useState(Stone.BLACK);
  const [captures, setCaptures] = useState({ black: 0, white: 0 });
  const [moveHistory, setMoveHistory] = useState([]);
  const [passCount, setPassCount] = useState(0);
  const [hoverPosition, setHoverPosition] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [scoreData, setScoreData] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [animatingCaptures, setAnimatingCaptures] = useState([]);
  const [timerExpiry, setTimerExpiry] = useState(() => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + settings.timePerMove);
    return now;
  });
  const [isTimerActive, setIsTimerActive] = useState(true);
  const [gameStatus, setGameStatus] = useState('playing');
  
  const koHistoryRef = useRef(null);
  const aiTimeoutRef = useRef(null);
  const boardHistoryRef = useRef([]);

  const getAIColor = useCallback(() => 
    settings.humanColor === 'black' ? Stone.WHITE : Stone.BLACK
  , [settings.humanColor]);

  const initializeGame = useCallback(() => {
    const newBoard = makeEmptyBoard(settings.boardSize);
    setBoard(newBoard);
    setCurrentPlayer(Stone.BLACK);
    setCaptures({ black: 0, white: 0 });
    setMoveHistory([]);
    setPassCount(0);
    setLastMove(null);
    setShowScore(false);
    setScoreData(null);
    setAnimatingCaptures([]);
    setGameStatus('playing');
    setIsTimerActive(true);
    koHistoryRef.current = null;
    boardHistoryRef.current = [];
    
    setTimerExpiry(() => {
      const now = new Date();
      now.setSeconds(now.getSeconds() + settings.timePerMove);
      return now;
    });
    
    if (gameMode === 'ai' && settings.humanColor === 'white') {
      setTimeout(() => handleAIMove(), 500);
    }
  }, [settings.boardSize, settings.humanColor, settings.timePerMove, gameMode]);

  useEffect(() => {
    initializeGame();
  }, [settings.boardSize]);

  const isValidMove = useCallback((pos) => {
    if (!inBounds(pos.x, pos.y, board.length) || board[pos.y][pos.x] !== Stone.EMPTY) 
      return false;
    if (gameMode === 'ai' && currentPlayer === getAIColor()) return false;
    if (gameStatus !== 'playing') return false;
    return tryPlay(board, pos.x, pos.y, currentPlayer, koHistoryRef.current).legal;
  }, [board, currentPlayer, gameMode, gameStatus, getAIColor]);

  const calculateScore = useCallback(() => {
    const territory = { black: 0, white: 0 };
    const visited = new Set();
    const size = board.length;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (board[y][x] === Stone.EMPTY && !visited.has(`${x},${y}`)) {
          const queue = [{x, y}];
          const territoryGroup = [];
          const borders = new Set();
          
          while (queue.length > 0) {
            const curr = queue.shift();
            const key = `${curr.x},${curr.y}`;
            if (visited.has(key)) continue;
            
            visited.add(key);
            territoryGroup.push(curr);
            
            for (const n of getNeighbors(curr.x, curr.y, size)) {
              const stone = board[n.y][n.x];
              if (stone === Stone.EMPTY && !visited.has(`${n.x},${n.y}`)) {
                queue.push(n);
              } else if (stone !== Stone.EMPTY) {
                borders.add(stone);
              }
            }
          }
          
          if (borders.size === 1) {
            const owner = Array.from(borders)[0];
            if (owner === Stone.BLACK) territory.black += territoryGroup.length;
            else territory.white += territoryGroup.length;
          }
        }
      }
    }
    
    const blackScore = territory.black + captures.black;
    const whiteScore = territory.white + captures.white + settings.komi;
    
    return {
      blackScore,
      whiteScore,
      blackTerritory: territory.black,
      whiteTerritory: territory.white,
      komi: settings.komi,
      winner: blackScore > whiteScore ? 'black' : whiteScore > blackScore ? 'white' : 'draw'
    };
  }, [board, captures, settings.komi]);

  const handleAIMove = useCallback(() => {
    if (currentPlayer !== getAIColor() || gameStatus !== 'playing') return;
    
    setIsLoadingAI(true);
    aiTimeoutRef.current = setTimeout(() => {
      const aiMove = pickAiMove(board, currentPlayer, settings.difficulty, koHistoryRef.current);
      setIsLoadingAI(false);
      
      if (aiMove.x !== -1) {
        handlePlaceStone(aiMove);
      } else {
        handlePass();
      }
    }, 400);
  }, [board, currentPlayer, settings.difficulty, gameStatus, getAIColor]);

  const handlePlaceStone = useCallback((pos) => {
    if (!isValidMove(pos) && !(gameMode === 'ai' && currentPlayer === getAIColor())) return;
    
    const result = tryPlay(board, pos.x, pos.y, currentPlayer, koHistoryRef.current);
    if (!result.legal || !result.board) return;
    
    boardHistoryRef.current = [...boardHistoryRef.current, copyBoard(board)];
    koHistoryRef.current = result.captures === 1 ? copyBoard(board) : null;
    
    setBoard(result.board);
    setLastMove(pos);
    
    if (result.captures && result.captures > 0) {
      setCaptures(prev => ({
        ...prev,
        [currentPlayer === Stone.BLACK ? 'black' : 'white']: 
          prev[currentPlayer === Stone.BLACK ? 'black' : 'white'] + result.captures
      }));
      
      if (result.capturedPositions) {
        setAnimatingCaptures(result.capturedPositions);
        setTimeout(() => setAnimatingCaptures([]), 600);
      }
    }
    
    setMoveHistory(prev => [...prev, {
      player: currentPlayer,
      position: pos,
      timestamp: Date.now(),
      captures: result.captures || 0,
      boardState: copyBoard(result.board)
    }]);
    
    const nextPlayer = currentPlayer === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
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
    
    setMoveHistory(prev => [...prev, {
      player: currentPlayer,
      position: { x: -1, y: -1 },
      timestamp: Date.now(),
      captures: 0,
      isPass: true,
      boardState: copyBoard(board)
    }]);
    
    if (newPassCount >= 2) {
      setGameStatus('finished');
      const finalScore = calculateScore();
      setScoreData(finalScore);
      setShowScore(true);
      setIsTimerActive(false);
    } else {
      const nextPlayer = currentPlayer === Stone.BLACK ? Stone.WHITE : Stone.BLACK;
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
    const actualUndo = Math.min(movesToUndo, moveHistory.length);
    const newHistory = moveHistory.slice(0, -actualUndo);
    
    setMoveHistory(newHistory);
    
    const previousBoard = boardHistoryRef.current[boardHistoryRef.current.length - actualUndo] || 
                         makeEmptyBoard(settings.boardSize);
    setBoard(previousBoard);
    
    let newCaptures = { black: 0, white: 0 };
    newHistory.forEach(move => {
      if (move.player === Stone.BLACK) newCaptures.black += move.captures;
      else newCaptures.white += move.captures;
    });
    setCaptures(newCaptures);
    
    setCurrentPlayer(newHistory.length > 0 ? 
      (newHistory[newHistory.length - 1].player === Stone.BLACK ? Stone.WHITE : Stone.BLACK) : 
      Stone.BLACK);
    
    setLastMove(newHistory.length > 0 && !newHistory[newHistory.length - 1].isPass ? 
      newHistory[newHistory.length - 1].position : null);
    
    setPassCount(0);
    setShowScore(false);
    setGameStatus('playing');
    koHistoryRef.current = null;
    boardHistoryRef.current = boardHistoryRef.current.slice(0, -actualUndo);
    
    setTimerExpiry(() => {
      const now = new Date();
      now.setSeconds(now.getSeconds() + settings.timePerMove);
      return now;
    });
  }, [moveHistory, gameMode, settings.boardSize, settings.timePerMove]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'p' || e.key === 'P') handlePass();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 't' || e.key === 'T') setShowTutorial(true);
      if (e.key === 'n' || e.key === 'N') initializeGame();
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handlePass, handleUndo, initializeGame]);

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, []);

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
        
        <div className="absolute inset-0" style={{ padding, pointerEvents: 'none' }}>
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
  }, [board, settings.boardSize, hoverPosition, lastMove, isValidMove, handlePlaceStone, isLoadingAI, animatingCaptures, currentPlayer]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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
        `}
      </style>

      <div className="relative z-10 max-w-8xl mx-auto p-4 sm:p-6">
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

            <div className="flex items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-3 glass-effect rounded-xl px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full float-animation ${
                    currentPlayer === Stone.BLACK
                      ? 'bg-gradient-to-br from-gray-800 to-black shadow-lg'
                      : 'bg-gradient-to-br from-white to-gray-200 shadow-lg border-2 border-gray-300'
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

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-3 space-y-4 order-2 xl:order-1">
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
                      setScoreData(score);
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
                    setScoreData(score);
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

          <div className="xl:col-span-6 order-1 xl:order-2">
            <div className="glass-effect rounded-2xl p-4 sm:p-6 neo-shadow">
              <div className="flex justify-center">
                {renderBoard}
              </div>
            </div>
          </div>

          <div className="xl:col-span-3 space-y-4 order-3">
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
                        {['easy', 'medium', 'hard'].map(level => (
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
                    Time per Move: {settings.timePerMove}s
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="300"
                    value={settings.timePerMove}
                    onChange={(e) => setSettings(prev => ({ ...prev, timePerMove: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

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

      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
      <ScoreModal
        isOpen={showScore}
        scoreData={scoreData}
        captures={captures}
        komi={settings.komi}
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
