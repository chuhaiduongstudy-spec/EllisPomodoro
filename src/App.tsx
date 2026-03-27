import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, SkipForward, Settings, BarChart2, Volume2, 
  MonitorPlay, Maximize2, Minimize2, ChevronLeft, ChevronRight,
  Clock, X, Plus, Trash2, Moon, Move, Download, Upload, Loader2
} from 'lucide-react';

// --- Custom Hooks & Helpers ---

// 1. Local Storage Hook for persistence
function useLocalStorage(key: string, initialValue: any) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn('Error reading localStorage', error);
      return initialValue;
    }
  });

  const setValue = (value: any) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn('Error setting localStorage', error);
    }
  };

  return [storedValue, setValue];
}

// 2. Idle Detection Hook for auto-hiding UI
function useIdle(ms = 5000) {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdle = useCallback(() => {
    setIsIdle(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsIdle(true), ms);
  }, [ms]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'pointerdown', 'pointermove', 'keydown', 'click'];
    events.forEach(event => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    
    return () => {
      events.forEach(event => window.removeEventListener(event, resetIdle, { passive: true }));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetIdle]);

  return isIdle;
}

// 3. File Conversion Helpers
async function blobUrlToBase64(blobUrl: string) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to convert blob to base64", e);
    return null;
  }
}

function base64ToBlobUrl(base64: string) {
  try {
    const parts = base64.split(',');
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Failed to convert base64 to blob", e);
    return null;
  }
}

// --- Video Crossfade Component ---
const FadeVideo = ({ url, zIndex, onLoaded, onEnded, loop }: any) => {
  const [opacity, setOpacity] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLoadedRef = useRef(false);

  const handleReady = () => {
    if (isLoadedRef.current) return;
    isLoadedRef.current = true;
    setOpacity(1);
    if (onLoaded) onLoaded();
  };

  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 3) {
      handleReady();
    }
  }, []);

  return (
    <video
      ref={videoRef}
      src={url}
      autoPlay
      loop={loop}
      muted
      playsInline
      onCanPlay={handleReady}
      onLoadedData={handleReady}
      onEnded={onEnded}
      className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
      style={{ zIndex, opacity }}
    />
  );
};

// --- Main Application ---

export default function App() {
  // --- State & Settings ---
  
  // Timer Settings
  const [durations, setDurations] = useLocalStorage('ff_durations', {
    focus: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60
  });
  
  // App State
  const [phase, setPhase] = useState('focus'); // 'focus', 'shortBreak', 'longBreak'
  const [timeLeft, setTimeLeft] = useState(durations.focus);
  const [isActive, setIsActive] = useState(false);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [sessionCount, setSessionCount] = useLocalStorage('ff_session_count', 0);
  
  // Default Videos
  const defaultVideos = {
    idle: [{ url: 'https://cdn.pixabay.com/video/2022/11/01/137351-766324881_large.mp4', duration: null }],
    focus: [{ url: 'https://cdn.pixabay.com/video/2020/05/25/40134-425232152_large.mp4', duration: null }],
    break: [{ url: 'https://cdn.pixabay.com/video/2023/10/22/186115-877633420_large.mp4', duration: null }]
  };

  const [videos, setVideos] = useLocalStorage('ff_videos', defaultVideos);

  const normalizeVideos = (categoryList: any, defaultList: any) => {
    if (!categoryList || categoryList.length === 0) return defaultList;
    return categoryList.map((v: any) => typeof v === 'string' ? { url: v, duration: null } : v);
  };

  const safeVideos = {
    idle: normalizeVideos(videos?.idle, defaultVideos.idle),
    focus: normalizeVideos(videos?.focus, defaultVideos.focus),
    break: normalizeVideos(videos?.break, defaultVideos.break)
  };

  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  // Auto Switch Scene Settings
  const [autoSwitchSettings, setAutoSwitchSettings] = useLocalStorage('ff_auto_switch', {
    idle: { enabled: false, type: 'interval', interval: 60 },
    focus: { enabled: false, type: 'interval', interval: 300 },
    break: { enabled: false, type: 'interval', interval: 60 }
  });

  const safeAutoSwitch = {
    idle: autoSwitchSettings?.idle || { enabled: false, type: 'interval', interval: 60 },
    focus: autoSwitchSettings?.focus || { enabled: false, type: 'interval', interval: 300 },
    break: autoSwitchSettings?.break || { enabled: false, type: 'interval', interval: 60 }
  };

  // Audio/Ambient State
  const [ambientSettings, setAmbientSettings] = useLocalStorage('ff_ambient', {
    url: 'https://cdn.freesound.org/previews/515/515823_11005234-lq.mp3',
    volume: 0.5,
    isPlaying: false
  });

  // UI State
  const [uiPosition, setUiPosition] = useLocalStorage('ff_ui_pos', 'top-right');
  const [timerScale, setTimerScale] = useLocalStorage('ff_timer_scale', 1);
  const [overlayOpacity, setOverlayOpacity] = useLocalStorage('ff_overlay_opacity', 0.2);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const isIdle = useIdle(5000);

  // Analytics
  const [stats, setStats] = useLocalStorage('ff_stats', {
    totalFocusTime: 0,
    history: []
  });

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const miniTimerRef = useRef<HTMLDivElement>(null);

  // --- Core Timer Logic ---

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time: number) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      handlePhaseComplete();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft]);

  const handlePhaseComplete = () => {
    const audio = new Audio('https://cdn.freesound.org/previews/320/320655_527080-lq.mp3');
    audio.play().catch(e => console.log("Audio play failed:", e));

    if (phase === 'focus') {
      const newSessionCount = sessionCount + 1;
      setSessionCount(newSessionCount);
      
      setStats((prev: any) => ({
        totalFocusTime: prev.totalFocusTime + durations.focus,
        history: [{ date: new Date().toISOString(), type: 'focus', duration: durations.focus }, ...prev.history].slice(0, 50)
      }));

      if (newSessionCount % 4 === 0) {
        switchPhase('longBreak');
      } else {
        switchPhase('shortBreak');
      }
    } else {
      switchPhase('focus');
    }
  };

  const switchPhase = (newPhase: string) => {
    setPhase(newPhase);
    setTimeLeft(durations[newPhase as keyof typeof durations]);
    setIsActive(false);
    setIsSessionStarted(true);
    setCurrentVideoIndex(0);
  };

  const toggleTimer = () => {
    if (!isSessionStarted) {
      setIsSessionStarted(true);
      setCurrentVideoIndex(0);
    }
    setIsActive(!isActive);
  };
  
  const resetTimer = () => {
    setIsActive(false);
    setIsSessionStarted(false);
    setCurrentVideoIndex(0);
    setTimeLeft(durations[phase as keyof typeof durations]);
  };
  const skipPhase = () => handlePhaseComplete();

  // --- Video & Audio Handlers ---

  const currentCategory = !isSessionStarted ? 'idle' : (phase === 'focus' ? 'focus' : 'break');
  const currentVideoList = safeVideos[currentCategory as keyof typeof safeVideos];
    
  const currentVideoObj = currentVideoList[currentVideoIndex] || currentVideoList[0];
  const currentVideoUrl = currentVideoObj?.url || '';

  // --- Seamless Video Crossfade State ---
  const [videoStack, setVideoStack] = useState<any[]>([]);

  useEffect(() => {
    if (!currentVideoUrl) return;
    setVideoStack(prev => {
      if (prev.length > 0 && prev[prev.length - 1].url === currentVideoUrl) return prev;
      const newStack = [...prev, { id: Date.now() + Math.random(), url: currentVideoUrl }];
      return newStack.length > 3 ? newStack.slice(newStack.length - 3) : newStack;
    });
  }, [currentVideoUrl]);

  const handleVideoLoaded = useCallback((id: number) => {
    setTimeout(() => {
      setVideoStack(prev => {
        const index = prev.findIndex(v => v.id === id);
        if (index !== -1) {
          return prev.slice(index);
        }
        return prev;
      });
    }, 1000);
  }, []);

  const currentSettings = safeAutoSwitch[currentCategory as keyof typeof safeAutoSwitch];
  const isAutoSwitchInterval = currentSettings?.enabled && (!currentSettings?.type || currentSettings?.type === 'interval');
  const defaultInterval = currentSettings?.interval || 60;
  const currentVideoDuration = currentVideoObj?.duration || null;
  const listLength = currentVideoList.length;

  useEffect(() => {
    if (isAutoSwitchInterval && listLength > 1) {
      const intervalTime = currentVideoDuration || defaultInterval;

      if (intervalTime > 0) {
        const timerId = setInterval(() => {
          setCurrentVideoIndex(prev => (prev + 1) % listLength);
        }, intervalTime * 1000);
        
        return () => clearInterval(timerId);
      }
    }
  }, [currentCategory, currentVideoIndex, isAutoSwitchInterval, defaultInterval, currentVideoDuration, listLength]);

  const isSwitchOnEnd = currentSettings?.enabled && currentSettings?.type === 'onEnd' && listLength > 1;

  const handleVideoEnded = useCallback(() => {
    if (isSwitchOnEnd) {
      setCurrentVideoIndex(prev => (prev + 1) % currentVideoList.length);
    }
  }, [isSwitchOnEnd, currentVideoList.length]);

  const nextVideo = () => setCurrentVideoIndex((prev) => (prev + 1) % currentVideoList.length);
  const prevVideo = () => setCurrentVideoIndex((prev) => (prev - 1 + currentVideoList.length) % currentVideoList.length);

  const handleFileUpload = (e: any, category: string) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideos((prev: any) => {
        const currentCatList = normalizeVideos(prev[category], defaultVideos[category as keyof typeof defaultVideos]);
        return {
          ...prev,
          [category]: [...currentCatList, { url, duration: null }]
        };
      });
    }
  };

  const removeVideo = (category: string, index: number) => {
    setVideos((prev: any) => {
      const currentCatList = normalizeVideos(prev[category], defaultVideos[category as keyof typeof defaultVideos]);
      currentCatList.splice(index, 1);
      return { ...prev, [category]: currentCatList };
    });
    if (currentVideoIndex >= safeVideos[category as keyof typeof safeVideos].length - 1) {
      setCurrentVideoIndex(0);
    }
  };

  const updateVideoDuration = (category: string, index: number, value: string) => {
    let numValue: number | null = value === '' ? null : parseInt(value, 10);
    if (Number.isNaN(numValue)) numValue = null; // Prevent NaN
    
    setVideos((prev: any) => {
      const currentCatList = normalizeVideos(prev[category], defaultVideos[category as keyof typeof defaultVideos]);
      currentCatList[index] = { ...currentCatList[index], duration: numValue };
      return { ...prev, [category]: currentCatList };
    });
  };

  // --- Data Export & Import (Save/Load) ---

  const exportData = async () => {
    setIsExporting(true);
    try {
      const exportPayload = {
        durations,
        ambientSettings,
        uiPosition,
        timerScale,
        overlayOpacity,
        autoSwitchSettings,
        videos: { idle: [], focus: [], break: [] } as any
      };

      for (const category of ['idle', 'focus', 'break']) {
        for (const vid of safeVideos[category as keyof typeof safeVideos]) {
          let finalUrl = vid.url;
          if (vid.url.startsWith('blob:')) {
            const b64 = await blobUrlToBase64(vid.url);
            if (b64) finalUrl = b64;
          }
          exportPayload.videos[category].push({ url: finalUrl, duration: vid.duration });
        }
      }

      const jsonStr = JSON.stringify(exportPayload);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `focusflow-save-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export Error:", err);
      alert("Có lỗi xảy ra khi tạo Save File.");
    } finally {
      setIsExporting(false);
    }
  };

  const importData = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (data.durations) setDurations(data.durations);
        if (data.ambientSettings) setAmbientSettings(data.ambientSettings);
        if (data.uiPosition) setUiPosition(data.uiPosition);
        if (data.timerScale) setTimerScale(data.timerScale);
        if (data.overlayOpacity) setOverlayOpacity(data.overlayOpacity);
        if (data.autoSwitchSettings) setAutoSwitchSettings(data.autoSwitchSettings);
        
        if (data.videos) {
          const restoredVideos: any = { idle: [], focus: [], break: [] };
          for (const category of ['idle', 'focus', 'break']) {
            if (data.videos[category]) {
              for (const vid of data.videos[category]) {
                let finalUrl = vid.url;
                if (finalUrl.startsWith('data:video/')) {
                  const blobUrl = base64ToBlobUrl(finalUrl);
                  if (blobUrl) finalUrl = blobUrl;
                }
                restoredVideos[category].push({ url: finalUrl, duration: vid.duration });
              }
            }
          }
          setVideos(restoredVideos);
        }
        
        alert("Khôi phục Save File thành công!");
      } catch (err) {
        console.error("Import Error:", err);
        alert("Tệp Save không hợp lệ hoặc bị lỗi.");
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Formatting Helpers ---
  const formatTime = (seconds: number) => {
    // Prevent formatting NaN if seconds ever becomes undefined/NaN
    if (typeof seconds !== 'number' || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // --- Drag Logic for Mini Timer ---
  const [miniPos, setMiniPos] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: any) => {
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - miniPos.x,
      y: e.clientY - miniPos.y
    };
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    setMiniPos({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = () => setIsDragging(false);

  // --- Render Sections ---

  const renderPortraitWarning = () => (
    <div className="md:hidden fixed inset-0 z-[100] bg-slate-900 text-white flex flex-col items-center justify-center p-8 text-center sm:hidden portrait:flex landscape:hidden">
      <Move className="w-16 h-16 animate-pulse mb-4" />
      <h2 className="text-2xl font-bold mb-2">Please Rotate Your Device</h2>
      <p className="text-slate-400">FocusFlow is optimized for landscape mode to provide an immersive experience.</p>
    </div>
  );

  const shouldHideUi = isIdle && !showSettings && !showAnalytics;

  return (
    <div 
      className="relative w-full h-screen overflow-hidden bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30"
      onPointerMove={isDragging ? handlePointerMove : undefined}
      onPointerUp={isDragging ? handlePointerUp : undefined}
    >
      {renderPortraitWarning()}

      {/* --- Background Layer --- */}
      {videoStack.map((video, index) => (
        <FadeVideo
          key={video.id}
          url={video.url}
          zIndex={index}
          onLoaded={() => handleVideoLoaded(video.id)}
          loop={!isSwitchOnEnd}
          onEnded={handleVideoEnded}
        />
      ))}
      {!currentVideoUrl && (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 z-0" />
      )}
      
      {/* Ambient Audio Element (Hidden) */}
      <audio
        ref={audioRef}
        src={ambientSettings.url}
        autoPlay={ambientSettings.isPlaying}
        loop
      />

      {/* Dark Overlay for better text readability */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-colors duration-500" 
        style={{ backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})` }} 
      />

      {/* --- Floating Mini Timer Mode --- */}
      {isMiniMode && (
        <div
          ref={miniTimerRef}
          className="absolute z-50 bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl shadow-2xl flex flex-col items-center cursor-move touch-none"
          style={{ transform: `translate(${miniPos.x}px, ${miniPos.y}px)` }}
          onPointerDown={handlePointerDown}
        >
          <div className="flex justify-between w-full items-center mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{phase}</span>
            <button onClick={() => setIsMiniMode(false)} className="p-1 hover:bg-slate-700 rounded-full">
              <Maximize2 size={14} />
            </button>
          </div>
          <div className="text-4xl font-mono font-bold tracking-tighter my-2">
            {formatTime(timeLeft)}
          </div>
          <div className="flex gap-4 mt-2">
            <button onClick={toggleTimer} className="p-2 bg-indigo-600 rounded-full hover:bg-indigo-500">
              {isActive ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={skipPhase} className="p-2 bg-slate-700 rounded-full hover:bg-slate-600">
              <SkipForward size={16} />
            </button>
          </div>
        </div>
      )}

      {/* --- Main UI Overlay --- */}
      {!isMiniMode && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          
          {/* Top Bar Controls */}
          <div className={`absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-auto transition-opacity duration-700 ${
            shouldHideUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}>
            <div className="flex gap-3 bg-slate-900/40 backdrop-blur-md p-2 rounded-2xl border border-white/10">
              <button 
                onClick={() => setShowAnalytics(true)}
                className="p-3 rounded-xl hover:bg-white/10 transition-colors tooltip"
                title="Analytics"
              >
                <BarChart2 size={20} />
              </button>
              <button 
                onClick={() => setAmbientSettings((p: any) => ({ ...p, isPlaying: !p.isPlaying }))}
                className={`p-3 rounded-xl hover:bg-white/10 transition-colors ${ambientSettings.isPlaying ? 'text-indigo-400' : ''}`}
                title="Ambient Sound"
              >
                <Volume2 size={20} />
              </button>
              <button 
                onClick={() => setIsMiniMode(true)}
                className="p-3 rounded-xl hover:bg-white/10 transition-colors"
                title="Mini Mode"
              >
                <Minimize2 size={20} />
              </button>
            </div>

            <div className="flex gap-3 bg-slate-900/40 backdrop-blur-md p-2 rounded-2xl border border-white/10">
              <button 
                onClick={() => setShowSettings(true)}
                className="p-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          {/* Main Timer Display */}
          <div className={`absolute pointer-events-auto flex flex-col items-center
            ${uiPosition === 'top-right' ? 'top-24 right-8' : 
              uiPosition === 'top-left' ? 'top-24 left-8' : 
              'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}
          `}>
            <div 
              className={`p-8 flex flex-col items-center transition-all duration-700 rounded-[2.5rem] ${
                shouldHideUi 
                  ? 'bg-transparent border-transparent shadow-none backdrop-blur-none' 
                  : 'bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl'
              }`}
              style={{ 
                transform: `scale(${timerScale})`,
                transformOrigin: uiPosition === 'top-right' ? 'top right' : uiPosition === 'top-left' ? 'top left' : 'center center'
              }}
            >
              <div className={`flex gap-2 bg-black/30 p-1 rounded-full mb-8 transition-opacity duration-700 ${
                shouldHideUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}>
                {['focus', 'shortBreak', 'longBreak'].map((p) => (
                  <button
                    key={p}
                    onClick={() => switchPhase(p)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      phase === p ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {p === 'focus' ? 'Focus' : p === 'shortBreak' ? 'Short Break' : 'Long Break'}
                  </button>
                ))}
              </div>

              <div 
                className="text-[7rem] leading-none font-mono font-bold tracking-tighter mb-8 tabular-nums cursor-pointer select-none drop-shadow-2xl"
                onClick={toggleTimer}
              >
                {formatTime(timeLeft)}
              </div>

              <div className={`flex items-center gap-6 transition-opacity duration-700 ${
                shouldHideUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}>
                <button 
                  onClick={resetTimer}
                  className="p-4 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Clock size={24} />
                </button>
                
                <button 
                  onClick={toggleTimer}
                  className="w-20 h-20 flex items-center justify-center bg-indigo-600 rounded-full hover:bg-indigo-500 text-white shadow-xl shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95"
                >
                  {isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                </button>

                <button 
                  onClick={skipPhase}
                  className="p-4 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <SkipForward size={24} />
                </button>
              </div>
            </div>
          </div>

          {/* Video Switcher Controls */}
          {currentVideoList.length > 1 && (
            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-slate-900/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 pointer-events-auto transition-opacity duration-700 ${
              shouldHideUi ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
              <button onClick={prevVideo} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <ChevronLeft size={20} />
              </button>
              <span className="text-sm font-medium tracking-widest uppercase text-slate-300">
                Scene {currentVideoIndex + 1} / {currentVideoList.length}
              </span>
              <button onClick={nextVideo} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- Settings Modal --- */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="text-indigo-400" /> Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
              {/* Timer Durations */}
              <section>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Durations (Minutes)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries({ focus: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' }).map(([key, label]) => (
                    <div key={key} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                      <label className="block text-sm text-slate-400 mb-2">{label}</label>
                      <input 
                        type="number" 
                        min="1"
                        value={durations[key as keyof typeof durations] ? Math.floor(durations[key as keyof typeof durations] / 60) : ''}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          const val = valStr === '' ? 0 : parseInt(valStr, 10) * 60;
                          setDurations((d: any) => ({ ...d, [key]: val }));
                          if (phase === key) setTimeLeft(val || 0);
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* UI Preferences */}
              <section>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Appearance</h3>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Timer Position</div>
                      <div className="text-sm text-slate-400">Where should the main timer overlay appear?</div>
                    </div>
                    <select 
                      value={uiPosition}
                      onChange={(e) => setUiPosition(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none"
                    >
                      <option value="center">Center</option>
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                    </select>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <div className="font-medium">Timer Size (Kích thước)</div>
                      <div className="text-indigo-400 font-medium">{Math.round(timerScale * 100)}%</div>
                    </div>
                    <div className="text-sm text-slate-400 mb-3">Tùy chỉnh độ lớn của đồng hồ chính</div>
                    <input 
                      type="range" 
                      min="0.5" max="2" step="0.05"
                      value={timerScale}
                      onChange={(e) => setTimerScale(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <div className="font-medium">Background Darkening (Độ tối nền)</div>
                      <div className="text-indigo-400 font-medium">{Math.round(overlayOpacity * 100)}%</div>
                    </div>
                    <div className="text-sm text-slate-400 mb-3">Làm tối video để dễ nhìn chữ hơn</div>
                    <input 
                      type="range" 
                      min="0" max="0.8" step="0.05"
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </section>

              {/* Video Management */}
              <section>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Video Backgrounds</h3>
                
                {[
                  { id: 'idle', label: 'Màn hình chờ (Idle)' },
                  { id: 'focus', label: 'Tập trung (Focus)' },
                  { id: 'break', label: 'Nghỉ ngơi (Break)' }
                ].map(category => (
                  <div key={category.id} className="mb-6 bg-slate-800/30 p-4 rounded-2xl border border-slate-700/30">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium">{category.label}</h4>
                      <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors">
                        <Plus size={16} /> Add Local Video
                        <input 
                          type="file" 
                          accept="video/*" 
                          className="hidden" 
                          onChange={(e) => handleFileUpload(e, category.id)} 
                        />
                      </label>
                    </div>
                    <div className="space-y-2">
                      {safeVideos[category.id as keyof typeof safeVideos].map((vid: any, idx: number) => (
                        <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800 gap-3">
                          <span className="truncate text-sm text-slate-400 flex-1 w-full sm:w-auto">
                            {vid.url.startsWith('blob:') ? 'Local Upload ' + (idx + 1) : vid.url}
                          </span>
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                            {safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].enabled && (!safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].type || safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].type === 'interval') && (
                              <div className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700/50" title="Thời gian hiển thị (giây)">
                                <Clock size={14} className="text-slate-400" />
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="Auto"
                                  value={vid.duration === null ? '' : vid.duration}
                                  onChange={(e) => updateVideoDuration(category.id, idx, e.target.value)}
                                  className="w-14 bg-transparent border-none px-1 py-0.5 text-white text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded placeholder:text-slate-500"
                                />
                                <span className="text-xs text-slate-500">s</span>
                              </div>
                            )}
                            <button 
                              onClick={() => removeVideo(category.id, idx)}
                              className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0"
                              disabled={safeVideos[category.id as keyof typeof safeVideos].length <= 1}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {safeVideos[category.id as keyof typeof safeVideos].length > 1 && (
                      <div className="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 flex flex-col gap-3">
                        <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer w-fit">
                          <input
                            type="checkbox"
                            checked={safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].enabled}
                            onChange={(e) => setAutoSwitchSettings((prev: any) => ({
                              ...safeAutoSwitch,
                              [category.id]: { ...safeAutoSwitch[category.id as keyof typeof safeAutoSwitch], enabled: e.target.checked }
                            }))}
                            className="w-4 h-4 accent-indigo-500 rounded bg-slate-800 border-slate-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                          />
                          Tự động chuyển Video
                        </label>
                        
                        {safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].enabled && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pl-6 border-l-2 border-slate-700/50 ml-2">
                            <select
                              value={safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].type || 'interval'}
                              onChange={(e) => setAutoSwitchSettings((prev: any) => ({
                                ...safeAutoSwitch,
                                [category.id]: { ...safeAutoSwitch[category.id as keyof typeof safeAutoSwitch], type: e.target.value }
                              }))}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="interval">Sau một khoảng thời gian</option>
                              <option value="onEnd">Khi video hiện tại kết thúc</option>
                            </select>

                            {(!safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].type || safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].type === 'interval') && (
                              <div className="flex items-center gap-2 text-sm text-slate-400">
                                <span>Mỗi</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={safeAutoSwitch[category.id as keyof typeof safeAutoSwitch].interval || ''}
                                  onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10);
                                    setAutoSwitchSettings((prev: any) => ({
                                      ...safeAutoSwitch,
                                      [category.id]: { ...safeAutoSwitch[category.id as keyof typeof safeAutoSwitch], interval: isNaN(parsed) ? '' : parsed }
                                    }))
                                  }}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-center focus:outline-none focus:border-indigo-500"
                                />
                                <span>giây</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {/* Ambient Audio */}
              <section>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Ambient Audio</h3>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Audio Source</div>
                      <div className="text-sm text-slate-400">Select ambient sound to play in background</div>
                    </div>
                    <select 
                      value={ambientSettings.url}
                      onChange={(e) => setAmbientSettings((s: any) => ({ ...s, url: e.target.value }))}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none max-w-[200px]"
                    >
                      <option value="https://cdn.freesound.org/previews/515/515823_11005234-lq.mp3">Rain</option>
                      <option value="https://cdn.freesound.org/previews/175/175267_3221379-lq.mp3">Forest Birds</option>
                      <option value="https://cdn.freesound.org/previews/573/573031_12711124-lq.mp3">Coffee Shop</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Volume ({Math.round(ambientSettings.volume * 100)}%)</label>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.05"
                      value={ambientSettings.volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setAmbientSettings((s: any) => ({ ...s, volume: val }));
                        if (audioRef.current) audioRef.current.volume = val;
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </section>

              {/* Data Backup & Restore */}
              <section>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Data Management (Sao lưu & Khôi phục)</h3>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 space-y-4">
                  <div className="text-sm text-slate-400">
                    Lưu toàn bộ cài đặt và <b>tất cả các video bạn đã tải lên</b> thành một tệp (Save File) duy nhất để chia sẻ hoặc khôi phục trên thiết bị khác.
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={exportData}
                      disabled={isExporting}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {isExporting ? 'Đang đóng gói file...' : 'Xuất File (Save)'}
                    </button>
                    
                    <label className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
                      {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {isImporting ? 'Đang đọc...' : 'Tải File (Load)'}
                      <input 
                        type="file" 
                        accept=".json"
                        className="hidden" 
                        onChange={importData}
                        disabled={isImporting}
                      />
                    </label>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}

      {/* --- Analytics Modal --- */}
      {showAnalytics && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-800">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BarChart2 className="text-indigo-400" /> Productivity Stats
              </h2>
              <button onClick={() => setShowAnalytics(false)} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-white mb-2">{sessionCount}</div>
                  <div className="text-sm text-slate-400 uppercase tracking-wider">Sessions Completed</div>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-indigo-400 mb-2">
                    {Math.round(stats.totalFocusTime / 60)} <span className="text-lg">m</span>
                  </div>
                  <div className="text-sm text-slate-400 uppercase tracking-wider">Total Focus Time</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-slate-300 uppercase tracking-wider text-sm">Recent History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                  {stats.history.length === 0 ? (
                    <div className="text-center text-slate-500 py-4">No sessions recorded yet.</div>
                  ) : (
                    stats.history.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between items-center bg-slate-800/30 p-3 rounded-xl border border-slate-700/30">
                        <span className="text-slate-300">{new Date(h.date).toLocaleDateString()} {new Date(h.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <span className="text-indigo-400 font-medium">+{Math.round(h.duration / 60)} min</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Styles for Scrollbar & Mobile Orientation */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #334155;
          border-radius: 20px;
        }
      `}} />
    </div>
  );
}