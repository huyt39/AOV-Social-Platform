import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = false,
  muted = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [quality, setQuality] = useState(-1); // -1 = auto
  const [availableQualities, setAvailableQualities] = useState<{height: number; index: number}[]>([]);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const initPlayer = () => {
      // Check if it's an HLS stream
      if (src.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          
          hls.loadSource(src);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Get available quality levels
            const levels = hls.levels.map((level, index) => ({
              height: level.height,
              index,
            }));
            setAvailableQualities(levels);
            
            if (autoPlay) {
              video.play().catch(() => {});
            }
          });
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.error('HLS fatal error:', data);
            }
          });
          
          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS support
          video.src = src;
          if (autoPlay) {
            video.play().catch(() => {});
          }
        }
      } else {
        // Regular video file
        video.src = src;
        if (autoPlay) {
          video.play().catch(() => {});
        }
      }
    };

    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const time = Number(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleQualityChange = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setQuality(levelIndex);
    }
    setShowQualityMenu(false);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      className={`relative bg-black group ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        muted={isMuted}
        playsInline
        onClick={togglePlay}
      />

      {/* Play overlay for initial state */}
      {!isPlaying && (
        <div 
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center">
            <Play className="w-8 h-8 text-white ml-1" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress bar */}
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer mb-2
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gold-500"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-gold-400 transition-colors">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            {/* Volume */}
            <button onClick={toggleMute} className="text-white hover:text-gold-400 transition-colors">
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Time */}
            <span className="text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Quality selector */}
            {availableQualities.length > 0 && (
              <div className="relative">
                <button 
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="text-white hover:text-gold-400 transition-colors flex items-center gap-1"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm">
                    {quality === -1 ? 'Auto' : `${availableQualities.find(q => q.index === quality)?.height}p`}
                  </span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => handleQualityChange(-1)}
                      className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-800 ${
                        quality === -1 ? 'text-gold-400' : 'text-white'
                      }`}
                    >
                      Auto
                    </button>
                    {availableQualities.map((q) => (
                      <button
                        key={q.index}
                        onClick={() => handleQualityChange(q.index)}
                        className={`block w-full px-4 py-2 text-left text-sm hover:bg-slate-800 ${
                          quality === q.index ? 'text-gold-400' : 'text-white'
                        }`}
                      >
                        {q.height}p
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white hover:text-gold-400 transition-colors">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
