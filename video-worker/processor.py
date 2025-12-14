"""FFmpeg video processor for transcoding and HLS generation.

Handles:
- Transcoding to multiple resolutions (480p, 720p, 1080p)
- HLS segment generation (.m3u8 + .ts files)
- Thumbnail extraction
"""

import os
import shutil
import subprocess
import logging
from pathlib import Path
from typing import Optional

from config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VideoProcessor:
    """Process videos using FFmpeg."""
    
    def __init__(self, video_id: str):
        """Initialize processor for a specific video."""
        self.video_id = video_id
        self.work_dir = Path(config.TEMP_DIR) / video_id
        self.input_path: Optional[Path] = None
        self.output_dir = self.work_dir / "output"
        
    def setup(self) -> None:
        """Create working directories."""
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created work directory: {self.work_dir}")
        
    def cleanup(self) -> None:
        """Remove working directories."""
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir)
            logger.info(f"Cleaned up work directory: {self.work_dir}")
    
    def save_input(self, video_data: bytes, filename: str = "input.mp4") -> Path:
        """Save input video to work directory."""
        self.input_path = self.work_dir / filename
        with open(self.input_path, 'wb') as f:
            f.write(video_data)
        logger.info(f"Saved input video: {self.input_path} ({len(video_data)} bytes)")
        return self.input_path
    
    def get_video_info(self) -> dict:
        """Get video information using ffprobe."""
        if not self.input_path:
            raise ValueError("Input video not set")
            
        cmd = [
            'ffprobe', '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            str(self.input_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"ffprobe failed: {result.stderr}")
            return {}
            
        import json
        return json.loads(result.stdout)
    
    def get_duration(self) -> Optional[float]:
        """Get video duration in seconds."""
        info = self.get_video_info()
        
        try:
            return float(info.get('format', {}).get('duration', 0))
        except (ValueError, TypeError):
            return None
    
    def get_original_resolution(self) -> tuple[int, int]:
        """Get original video resolution."""
        info = self.get_video_info()
        
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'video':
                return (
                    stream.get('width', 1920),
                    stream.get('height', 1080)
                )
        return (1920, 1080)
    
    def determine_output_resolutions(self) -> list[str]:
        """Determine which resolutions to generate based on input."""
        orig_width, orig_height = self.get_original_resolution()
        
        output_resolutions = []
        for name, settings in config.RESOLUTIONS.items():
            # Only generate resolutions smaller or equal to original
            if settings['height'] <= orig_height:
                output_resolutions.append(name)
        
        # Always include at least 480p
        if "480p" not in output_resolutions:
            output_resolutions.append("480p")
            
        return sorted(output_resolutions, key=lambda x: int(x.replace('p', '')))
    
    def transcode_resolution(self, resolution: str) -> Optional[Path]:
        """Transcode video to a specific resolution with HLS output."""
        if not self.input_path:
            raise ValueError("Input video not set")
            
        settings = config.RESOLUTIONS.get(resolution)
        if not settings:
            logger.error(f"Unknown resolution: {resolution}")
            return None
            
        res_dir = self.output_dir / resolution
        res_dir.mkdir(parents=True, exist_ok=True)
        
        output_playlist = res_dir / "playlist.m3u8"
        
        # FFmpeg command for HLS output
        cmd = [
            'ffmpeg', '-y',
            '-i', str(self.input_path),
            # Video settings
            '-vf', f"scale={settings['width']}:{settings['height']}:force_original_aspect_ratio=decrease,pad={settings['width']}:{settings['height']}:(ow-iw)/2:(oh-ih)/2",
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', settings['bitrate'],
            '-maxrate', settings['bitrate'],
            '-bufsize', f"{int(settings['bitrate'].replace('k', '')) * 2}k",
            # Audio settings
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            # HLS settings
            '-f', 'hls',
            '-hls_time', '6',
            '-hls_list_size', '0',
            '-hls_segment_filename', str(res_dir / 'segment_%03d.ts'),
            str(output_playlist)
        ]
        
        logger.info(f"Transcoding to {resolution}...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"Transcode failed for {resolution}: {result.stderr}")
            return None
            
        logger.info(f"Transcoded to {resolution} successfully")
        return output_playlist
    
    def generate_master_playlist(self, resolutions: list[str]) -> Path:
        """Generate master HLS playlist for adaptive streaming."""
        master_path = self.output_dir / "master.m3u8"
        
        with open(master_path, 'w') as f:
            f.write("#EXTM3U\n")
            f.write("#EXT-X-VERSION:3\n")
            
            for resolution in resolutions:
                settings = config.RESOLUTIONS.get(resolution, {})
                bandwidth = int(settings.get('bitrate', '1000k').replace('k', '')) * 1000
                
                f.write(f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={settings.get('width', 854)}x{settings.get('height', 480)}\n")
                f.write(f"{resolution}/playlist.m3u8\n")
        
        logger.info(f"Generated master playlist: {master_path}")
        return master_path
    
    def generate_thumbnail(self, timestamp: float = 1.0) -> Optional[Path]:
        """Generate thumbnail from video."""
        if not self.input_path:
            raise ValueError("Input video not set")
            
        thumbnail_path = self.output_dir / "thumbnail.jpg"
        
        cmd = [
            'ffmpeg', '-y',
            '-i', str(self.input_path),
            '-ss', str(timestamp),
            '-vframes', '1',
            '-vf', 'scale=640:-1',
            '-q:v', '2',
            str(thumbnail_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"Thumbnail generation failed: {result.stderr}")
            return None
            
        logger.info(f"Generated thumbnail: {thumbnail_path}")
        return thumbnail_path
    
    def process(self, video_data: bytes) -> dict:
        """
        Full processing pipeline.
        
        Returns dict with:
        - success: bool
        - duration: float (seconds)
        - resolutions: list[str]
        - files: dict mapping relative paths to local paths
        """
        try:
            self.setup()
            self.save_input(video_data)
            
            # Get video info
            duration = self.get_duration()
            
            # Determine output resolutions
            resolutions = self.determine_output_resolutions()
            logger.info(f"Will generate resolutions: {resolutions}")
            
            # Transcode each resolution
            successful_resolutions = []
            for resolution in resolutions:
                result = self.transcode_resolution(resolution)
                if result:
                    successful_resolutions.append(resolution)
            
            if not successful_resolutions:
                return {"success": False, "error": "All transcodes failed"}
            
            # Generate master playlist
            self.generate_master_playlist(successful_resolutions)
            
            # Generate thumbnail
            self.generate_thumbnail()
            
            # Collect all output files
            files = {}
            for path in self.output_dir.rglob('*'):
                if path.is_file():
                    relative = path.relative_to(self.output_dir)
                    files[str(relative)] = path
            
            return {
                "success": True,
                "duration": duration,
                "resolutions": successful_resolutions,
                "files": files
            }
            
        except Exception as e:
            logger.exception(f"Processing failed: {e}")
            return {"success": False, "error": str(e)}
