/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bomb, Flag, RefreshCw, Trophy, Skull, Settings, Info, Volume2, VolumeX, Music, Upload, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Audio Synthesis ---
class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxEnabled: boolean = true;
  private bgmEnabled: boolean = true;
  private bgmVolume: number = 0.5;
  private customBgm: HTMLAudioElement | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
  }

  setBgmEnabled(enabled: boolean) {
    this.bgmEnabled = enabled;
    if (!enabled) this.stopBGM();
  }

  setBgmVolume(volume: number) {
    this.bgmVolume = volume;
    if (this.customBgm) {
      this.customBgm.volume = volume;
    }
  }

  setCustomBGM(file: File | null) {
    if (this.customBgm) {
      this.customBgm.pause();
      this.customBgm = null;
    }
    if (file) {
      const url = URL.createObjectURL(file);
      this.customBgm = new Audio(url);
      this.customBgm.loop = true;
      this.customBgm.volume = this.bgmVolume;
    }
  }

  playBGM() {
    if (!this.bgmEnabled) return;
    this.init();

    if (this.customBgm) {
      this.customBgm.volume = this.bgmVolume;
      this.customBgm.play().catch(e => console.error("Custom BGM play failed:", e));
    }
  }

  stopBGM() {
    if (this.customBgm) {
      this.customBgm.pause();
    }
  }

  playClick() {
    if (!this.sfxEnabled) return;
    this.init();
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx!.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx!.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx!.destination);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.1);
  }

  playFlag() {
    if (!this.sfxEnabled) return;
    this.init();
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx!.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx!.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx!.destination);
    osc.start();
    osc.stop(this.ctx!.currentTime + 0.1);
  }

  playExplosion() {
    if (!this.sfxEnabled) return;
    this.init();
    const bufferSize = this.ctx!.sampleRate * 0.5;
    const buffer = this.ctx!.createBuffer(1, bufferSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx!.currentTime);
    filter.frequency.exponentialRampToValueAtTime(10, this.ctx!.currentTime + 0.5);
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx!.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 0.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx!.destination);
    noise.start();
  }

  playWin() {
    if (!this.sfxEnabled) return;
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.05, this.ctx!.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + i * 0.1);
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.3);
    });
  }
}

const audio = new AudioManager();

// --- Game Logic Types ---
type Difficulty = 'easy' | 'medium' | 'hard';
type CellStatus = 'hidden' | 'revealed' | 'flagged';
interface Cell {
  isMine: boolean;
  neighborCount: number;
  status: CellStatus;
  x: number;
  y: number;
}

const CONFIG = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [timer, setTimer] = useState(0);
  const [flagsUsed, setFlagsUsed] = useState(0);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmVolume, setBgmVolume] = useState(0.5);
  const [customBgmName, setCustomBgmName] = useState<string | null>(null);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGameOverOverlay, setShowGameOverOverlay] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audio.setSfxEnabled(sfxEnabled);
  }, [sfxEnabled]);

  useEffect(() => {
    audio.setBgmEnabled(bgmEnabled);
  }, [bgmEnabled]);

  useEffect(() => {
    audio.setBgmVolume(bgmVolume);
  }, [bgmVolume]);

  useEffect(() => {
    if (gameState === 'playing') {
      audio.playBGM();
      setShowGameOverOverlay(true);
    } else if (gameState === 'won' || gameState === 'lost') {
      audio.stopBGM();
    } else if (gameState === 'idle') {
      audio.stopBGM();
    }
  }, [gameState]);

  const initGrid = useCallback((diff: Difficulty) => {
    const { rows, cols } = CONFIG[diff];
    const newGrid: Cell[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < cols; x++) {
        row.push({ isMine: false, neighborCount: 0, status: 'hidden', x, y });
      }
      newGrid.push(row);
    }
    setGrid(newGrid);
    setGameState('idle');
    setTimer(0);
    setFlagsUsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    initGrid(difficulty);
  }, [difficulty, initGrid]);

  const startGame = (firstX: number, firstY: number) => {
    const { rows, cols, mines } = CONFIG[difficulty];
    // Deep clone to avoid mutations
    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    
    // Place mines
    let minesPlaced = 0;
    while (minesPlaced < mines) {
      const rx = Math.floor(Math.random() * cols);
      const ry = Math.floor(Math.random() * rows);
      if (!newGrid[ry][rx].isMine && (Math.abs(rx - firstX) > 1 || Math.abs(ry - firstY) > 1)) {
        newGrid[ry][rx].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbors
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (newGrid[y][x].isMine) continue;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && newGrid[ny][nx].isMine) {
              count++;
            }
          }
        }
        newGrid[y][x].neighborCount = count;
      }
    }

    setGameState('playing');
    timerRef.current = setInterval(() => {
      setTimer(t => t + 1);
    }, 1000);

    revealCell(firstX, firstY, newGrid);
  };

  const revealCell = (x: number, y: number, currentGrid: Cell[][]) => {
    if (currentGrid[y][x].status !== 'hidden') return;

    const newGrid = currentGrid.map(row => row.map(cell => ({ ...cell })));
    const cell = newGrid[y][x];

    if (cell.isMine) {
      setGameState('lost');
      audio.playExplosion();
      if (timerRef.current) clearInterval(timerRef.current);
      newGrid.forEach(row => row.forEach(c => {
        if (c.isMine) c.status = 'revealed';
      }));
      setGrid(newGrid);
      return;
    }

    audio.playClick();

    const floodFill = (cx: number, cy: number) => {
      if (cx < 0 || cx >= CONFIG[difficulty].cols || cy < 0 || cy >= CONFIG[difficulty].rows) return;
      const c = newGrid[cy][cx];
      if (c.status !== 'hidden' || c.isMine) return;

      newGrid[cy][cx] = { ...c, status: 'revealed' };
      if (c.neighborCount === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            floodFill(cx + dx, cy + dy);
          }
        }
      }
    };

    floodFill(x, y);
    setGrid(newGrid);
    checkWin(newGrid);
  };

  const checkWin = (currentGrid: Cell[][]) => {
    const { mines } = CONFIG[difficulty];
    let hiddenCount = 0;
    currentGrid.forEach(row => row.forEach(c => {
      if (c.status === 'hidden' || c.status === 'flagged') hiddenCount++;
    }));

    if (hiddenCount === mines) {
      setGameState('won');
      audio.playWin();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCellClick = (x: number, y: number) => {
    if (gameState === 'won' || gameState === 'lost') return;
    const cell = grid[y][x];
    if (cell.status === 'flagged') return;

    if (gameState === 'idle') {
      startGame(x, y);
    } else if (cell.status === 'revealed') {
      // Chording logic
      const { rows, cols } = CONFIG[difficulty];
      let flagsAround = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx].status === 'flagged') {
            flagsAround++;
          }
        }
      }

      if (flagsAround === cell.neighborCount && cell.neighborCount > 0) {
        let tempGrid = grid.map(row => row.map(c => ({ ...c })));
        let hitMine = false;

        const innerFloodFill = (icx: number, icy: number) => {
          if (icx < 0 || icx >= cols || icy < 0 || icy >= rows) return;
          const ic = tempGrid[icy][icx];
          if (ic.status !== 'hidden' || ic.isMine) return;
          tempGrid[icy][icx] = { ...ic, status: 'revealed' };
          if (ic.neighborCount === 0) {
            for (let idy = -1; idy <= 1; idy++) {
              for (let idx = -1; idx <= 1; idx++) {
                if (idx === 0 && idy === 0) continue;
                innerFloodFill(icx + idx, icy + idy);
              }
            }
          }
        };

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && tempGrid[ny][nx].status === 'hidden') {
              if (tempGrid[ny][nx].isMine) {
                hitMine = true;
              } else {
                innerFloodFill(nx, ny);
              }
            }
          }
        }

        if (hitMine) {
          setGameState('lost');
          audio.playExplosion();
          if (timerRef.current) clearInterval(timerRef.current);
          tempGrid.forEach(r => r.forEach(c => { if (c.isMine) c.status = 'revealed'; }));
          setGrid(tempGrid);
        } else {
          setGrid(tempGrid);
          checkWin(tempGrid);
        }
      }
    } else {
      revealCell(x, y, grid);
    }
  };

  const handleRightClick = (e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault();
    if (gameState !== 'playing' && gameState !== 'idle') return;
    if (grid[y][x].status === 'revealed') return;

    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    const cell = newGrid[y][x];
    
    if (cell.status === 'hidden') {
      cell.status = 'flagged';
      setFlagsUsed(f => f + 1);
      audio.playFlag();
    } else {
      cell.status = 'hidden';
      setFlagsUsed(f => f - 1);
      audio.playFlag();
    }
    setGrid(newGrid);
  };

  const resetGame = () => {
    initGrid(difficulty);
  };

  const changeDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    setShowDifficultyModal(false);
    initGrid(d); // Force re-init
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      audio.setCustomBGM(file);
      setCustomBgmName(file.name);
      if (gameState === 'playing') {
        audio.stopBGM();
        audio.playBGM();
      }
    }
  };

  const clearCustomBgm = () => {
    audio.setCustomBGM(null);
    setCustomBgmName(null);
    if (gameState === 'playing') {
      audio.stopBGM();
      audio.playBGM();
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col items-center justify-start py-12 px-4 overflow-y-auto">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl mb-10 flex flex-col md:flex-row items-center justify-between gap-6"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white shadow-sm rounded-2xl border border-gray-200">
            <Bomb className="text-blue-500 w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Minesweeper</h1>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Status: {gameState}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="p-3 bg-white border border-gray-200 rounded-2xl text-gray-400 hover:text-gray-900 hover:border-gray-900 transition-all shadow-sm active:scale-95"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowDifficultyModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            <span>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
          </button>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-fit mb-6 md:mb-8 flex items-center gap-3 md:gap-6"
      >
        <StatBox label="MINES" value={CONFIG[difficulty].mines - flagsUsed} />
        <button 
          onClick={resetGame}
          className="group p-3 md:p-4 bg-white border border-gray-200 rounded-xl md:rounded-2xl hover:border-blue-500 transition-all active:scale-95 shadow-sm"
        >
          <RefreshCw className={`w-5 h-5 md:w-6 md:h-6 transition-transform group-hover:rotate-180 ${gameState === 'playing' ? 'text-blue-500' : 'text-gray-400'}`} />
        </button>
        <StatBox label="TIME" value={timer} />
      </motion.div>

      {/* Game Board */}
      <motion.div 
        layout
        className="relative w-full max-w-full p-4 md:p-10 bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-200 shadow-xl overflow-hidden"
      >
        {/* Decorative corner element */}
        <div className="absolute top-0 left-0 w-16 h-16 md:w-24 md:h-24 bg-gray-50 -translate-x-8 -translate-y-8 md:-translate-x-12 md:-translate-y-12 rotate-45 border-r border-gray-200 z-0" />
        <div className="absolute top-3 left-3 md:top-4 md:left-4 text-[8px] md:text-[10px] font-bold text-gray-300 uppercase tracking-widest z-20">
          Grid: {CONFIG[difficulty].rows}x{CONFIG[difficulty].cols}
        </div>
        
        <div className="overflow-x-auto pb-4 pt-8 md:pt-4 scrollbar-hide">
          <div 
            className="grid gap-1 md:gap-1.5 relative z-10 mx-auto"
            style={{ 
              gridTemplateColumns: `repeat(${CONFIG[difficulty].cols}, auto)`,
              width: 'fit-content'
            }}
          >
            {grid.map((row, y) => row.map((cell, x) => (
              <CellComponent 
                key={`${x}-${y}`} 
                cell={cell} 
                onClick={() => handleCellClick(x, y)}
                onRightClick={(e) => handleRightClick(e, x, y)}
                isGameOver={gameState === 'lost' || gameState === 'won'}
              />
            )))}
          </div>
        </div>

        {/* Overlay for Win/Loss */}
        <AnimatePresence>
          {(gameState === 'won' || gameState === 'lost') && showGameOverOverlay && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] z-10"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white border border-gray-100 p-10 rounded-[2.5rem] flex flex-col items-center gap-6 shadow-2xl relative"
              >
                <button 
                  onClick={() => setShowGameOverOverlay(false)}
                  className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                  title="View Board"
                >
                  <RefreshCw size={16} className="rotate-45" />
                </button>

                {gameState === 'won' ? (
                  <>
                    <div className="p-5 bg-green-50 rounded-full">
                      <Trophy className="w-12 h-12 text-green-500" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-3xl font-bold text-gray-900">Victory!</h2>
                      <p className="text-gray-500 mt-1">Grid cleared successfully.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-5 bg-red-50 rounded-full">
                      <Skull className="w-12 h-12 text-red-500" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-3xl font-bold text-gray-900">Game Over</h2>
                      <p className="text-gray-500 mt-1">System failure detected.</p>
                    </div>
                  </>
                )}
                <div className="flex gap-4 mt-2">
                  <div className="px-4 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Time: {timer}s
                  </div>
                </div>
                <button 
                  onClick={resetGame}
                  className="px-10 py-4 bg-gray-900 text-white font-bold uppercase text-sm tracking-widest rounded-2xl hover:bg-black transition-colors shadow-lg active:scale-95"
                >
                  Play Again
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 border border-gray-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-gray-900">Audio Settings</h2>
                <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-6">
                {/* SFX Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Volume2 className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Sound Effects</span>
                  </div>
                  <button 
                    onClick={() => setSfxEnabled(!sfxEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${sfxEnabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                  >
                    <motion.div 
                      animate={{ x: sfxEnabled ? 26 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                {/* BGM Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Music className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Background Music</span>
                  </div>
                  <button 
                    onClick={() => setBgmEnabled(!bgmEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${bgmEnabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                  >
                    <motion.div 
                      animate={{ x: bgmEnabled ? 26 : 4 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                {/* BGM Volume Slider */}
                <div className="space-y-3 p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-sm">
                        <Volume2 className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-sm font-bold text-gray-700">BGM Volume</span>
                    </div>
                    <span className="text-xs font-bold text-gray-400">{Math.round(bgmVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={bgmVolume} 
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                  />
                </div>

                {/* Custom BGM Selection */}
                <div className="p-4 bg-gray-50 rounded-2xl space-y-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-white rounded-xl shadow-sm">
                      <Upload className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-bold text-gray-700">Custom BGM</span>
                  </div>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="audio/*" 
                    className="hidden" 
                  />

                  {customBgmName ? (
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100">
                      <span className="text-xs font-medium text-gray-500 truncate max-w-[180px]">
                        {customBgmName}
                      </span>
                      <button onClick={clearCustomBgm} className="text-red-500 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 bg-white border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-all"
                    >
                      Upload Audio File
                    </button>
                  )}
                  <p className="text-[10px] text-gray-400 text-center">Supports MP3, WAV, OGG</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDifficultyModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setShowDifficultyModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 border border-gray-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Difficulty</h2>
                <button 
                  onClick={() => setShowDifficultyModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <RefreshCw size={20} className="text-gray-400 rotate-45" />
                </button>
              </div>
              
              <div className="space-y-3">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => changeDifficulty(d)}
                    className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${
                      difficulty === d 
                        ? 'border-blue-500 bg-blue-50/50' 
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div className="text-left">
                      <div className={`font-bold capitalize ${difficulty === d ? 'text-blue-600' : 'text-gray-900'}`}>
                        {d}
                      </div>
                      <div className="text-xs text-gray-400 font-medium mt-0.5">
                        {CONFIG[d].rows}x{CONFIG[d].cols} • {CONFIG[d].mines} Mines
                      </div>
                    </div>
                    {difficulty === d && (
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="mt-12 flex flex-wrap justify-center gap-8 text-gray-400 font-medium text-xs uppercase tracking-widest">
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-400 rounded-full" /> Left Click: Reveal</div>
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Right Click: Flag</div>
        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-gray-300 rounded-full" /> First Click: Safe</div>
        {(gameState === 'won' || gameState === 'lost') && !showGameOverOverlay && (
          <button 
            onClick={() => setShowGameOverOverlay(true)}
            className="flex items-center gap-2 text-blue-500 hover:text-blue-600 transition-colors"
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Show Results
          </button>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string, value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl flex flex-col items-center min-w-[100px] md:min-w-[140px] shadow-sm">
      <span className="text-[8px] md:text-[10px] font-bold text-gray-400 tracking-[0.2em] mb-1">{label}</span>
      <span className="text-xl md:text-3xl font-bold text-gray-900 tabular-nums">
        {String(value).padStart(3, '0')}
      </span>
    </div>
  );
}

const CellComponent = React.memo(({ 
  cell, 
  onClick, 
  onRightClick, 
  isGameOver 
}: { 
  cell: Cell, 
  onClick: () => void, 
  onRightClick: (e: React.MouseEvent) => void,
  isGameOver: boolean
}) => {
  const isRevealed = cell.status === 'revealed';
  const isFlagged = cell.status === 'flagged';

  const getNumberColor = (count: number) => {
    const colors = [
      '', 'text-blue-600', 'text-green-600', 'text-red-600', 
      'text-indigo-600', 'text-purple-600', 'text-cyan-600', 
      'text-rose-600', 'text-gray-800'
    ];
    return colors[count] || 'text-gray-900';
  };

  // Explicitly define classes to avoid any sync issues
  const getCellClasses = () => {
    const base = "w-7 h-7 md:w-10 md:h-10 flex items-center justify-center text-xs md:text-sm font-black cursor-pointer rounded-md md:rounded-lg select-none ";
    if (isRevealed) {
      if (cell.isMine) return base + "bg-red-500 text-white shadow-none border-none";
      return base + "bg-white border border-gray-100 shadow-none";
    }
    return base + "bg-gray-200 border-b-2 md:border-b-4 border-r-2 md:border-r-4 border-gray-400 shadow-md md:shadow-lg active:border-b-1 md:active:border-b-2 active:border-r-1 md:active:border-r-2 active:translate-y-[1px] md:active:translate-y-[2px]";
  };

  return (
    <motion.div
      key={`${cell.status}-${cell.isMine}`} // Force remount on status change
      whileHover={!isRevealed && !isGameOver ? { scale: 1.02, backgroundColor: '#D1D5DB' } : {}}
      whileTap={!isRevealed && !isGameOver ? { scale: 0.95 } : {}}
      onClick={onClick}
      onContextMenu={onRightClick}
      className={getCellClasses()}
    >
      {isRevealed ? (
        cell.isMine ? (
          <Bomb size={18} />
        ) : (
          cell.neighborCount > 0 && (
            <span className={getNumberColor(cell.neighborCount)}>
              {cell.neighborCount}
            </span>
          )
        )
      ) : isFlagged ? (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          <Flag size={16} className="text-green-600" fill="currentColor" />
        </motion.div>
      ) : null}
    </motion.div>
  );
});
