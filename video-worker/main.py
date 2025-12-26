"""Video Worker main entry point.

RabbitMQ consumer that:
1. Listens for transcode jobs
2. Downloads raw video from S3
3. Processes with FFmpeg (transcode + HLS)
4. Uploads results to S3
5. Notifies backend API

Best Practices Implemented:
- Threaded video processing to maintain heartbeat
- Connection recovery on failure
- Graceful shutdown handling
"""

import json
import logging
import signal
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, Future
from typing import Optional

import pika
import requests
from pika.exceptions import AMQPConnectionError, StreamLostError, ChannelWrongStateError

from config import config
from processor import VideoProcessor
from s3_client import s3_client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Graceful shutdown flag
shutdown_event = threading.Event()


def notify_backend(video_id: str, result: dict) -> bool:
    """Notify backend API that video processing is complete."""
    endpoint = f"{config.BACKEND_URL}/api/v1/videos/internal/{video_id}/processed"
    
    if result["success"]:
        payload = {
            "success": True,
            "duration": result.get("duration"),
            "resolutions": result.get("resolutions", []),
            "play_url": s3_client.get_play_url(video_id),
            "thumbnail_url": s3_client.get_thumbnail_url(video_id)
        }
    else:
        payload = {
            "success": False,
            "error_message": result.get("error", "Unknown error")
        }
    
    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers={"X-Internal-Token": config.INTERNAL_API_TOKEN},
            timeout=30
        )
        response.raise_for_status()
        logger.info(f"Notified backend for video {video_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to notify backend: {e}")
        return False


def process_video(video_id: str, raw_key: str) -> dict:
    """
    Process a single video.
    
    1. Download from S3
    2. Transcode with FFmpeg
    3. Upload results
    4. Notify backend
    """
    logger.info(f"Processing video: {video_id} (key: {raw_key})")
    
    processor = VideoProcessor(video_id)
    
    try:
        # Download raw video
        logger.info("Downloading raw video...")
        video_data = s3_client.download_raw_video(raw_key)
        
        if not video_data:
            return {"success": False, "error": "Failed to download raw video"}
        
        # Process video
        logger.info("Starting FFmpeg processing...")
        result = processor.process(video_data)
        
        if not result["success"]:
            return result
        
        # Upload processed files
        logger.info("Uploading processed files...")
        files = result.get("files", {})
        
        for relative_path, local_path in files.items():
            url = s3_client.upload_processed_file(
                str(local_path),
                video_id,
                relative_path
            )
            if not url:
                logger.warning(f"Failed to upload: {relative_path}")
        
        logger.info(f"Video {video_id} processed and uploaded successfully")
        
        return {
            "success": True,
            "duration": result.get("duration"),
            "resolutions": result.get("resolutions", [])
        }
        
    finally:
        # Cleanup temp files
        processor.cleanup()


class VideoWorker:
    """
    RabbitMQ consumer with best practices:
    - Heartbeat to keep connection alive during long processing
    - Thread pool for video processing to not block main thread
    - Connection recovery on failures
    - Graceful shutdown
    """
    
    def __init__(self):
        self.connection: Optional[pika.BlockingConnection] = None
        self.channel = None
        self.executor = ThreadPoolExecutor(max_workers=1)  # Process one at a time
        self.current_task: Optional[Future] = None
        self._lock = threading.Lock()
    
    def get_connection_parameters(self) -> pika.URLParameters:
        """
        Create connection parameters with proper heartbeat settings.
        
        Heartbeat of 600s (10 min) ensures connection stays alive during
        long video processing operations.
        """
        parameters = pika.URLParameters(config.RABBITMQ_URL)
        # Heartbeat every 10 minutes - RabbitMQ will check connection 2x per interval
        parameters.heartbeat = 600
        # Block connection timeout - how long to wait if server is blocked
        parameters.blocked_connection_timeout = 300
        # Socket timeout for operations
        parameters.socket_timeout = 60
        return parameters
    
    def connect(self) -> bool:
        """Establish connection to RabbitMQ with retry logic."""
        max_retries = 10
        retry_delay = 5
        
        for attempt in range(max_retries):
            if shutdown_event.is_set():
                return False
            
            try:
                parameters = self.get_connection_parameters()
                self.connection = pika.BlockingConnection(parameters)
                self.channel = self.connection.channel()
                
                # Declare queue
                self.channel.queue_declare(
                    queue=config.VIDEO_TRANSCODE_QUEUE, 
                    durable=True
                )
                
                # Process one message at a time
                self.channel.basic_qos(prefetch_count=1)
                
                logger.info(f"✅ Connected to RabbitMQ successfully")
                return True
                
            except AMQPConnectionError as e:
                logger.warning(
                    f"RabbitMQ connection failed (attempt {attempt + 1}/{max_retries}): {e}"
                )
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                else:
                    logger.error("Max retries reached")
                    return False
        
        return False
    
    def process_message_in_thread(self, video_id: str, raw_key: str) -> dict:
        """
        Process video in a separate thread.
        This allows the main thread to continue sending heartbeats.
        """
        try:
            result = process_video(video_id, raw_key)
            notify_backend(video_id, result)
            return result
        except Exception as e:
            logger.exception(f"Error in processing thread: {e}")
            return {"success": False, "error": str(e)}
    
    def on_message(self, channel, method, properties, body):
        """
        Handle incoming RabbitMQ message.
        
        Uses a thread pool to process video while keeping the main thread
        free to handle heartbeats and connection management.
        """
        delivery_tag = method.delivery_tag
        
        try:
            message = json.loads(body.decode())
            video_id = message.get("video_id")
            raw_key = message.get("raw_key")
            
            if not video_id or not raw_key:
                logger.error(f"Invalid message: {message}")
                self._safe_ack(channel, delivery_tag)
                return
            
            logger.info(f"Received job for video: {video_id}")
            
            # Submit processing to thread pool
            future = self.executor.submit(
                self.process_message_in_thread, 
                video_id, 
                raw_key
            )
            
            # Wait for result while processing connection events (heartbeats)
            while not future.done():
                if shutdown_event.is_set():
                    logger.info("Shutdown requested, waiting for current job...")
                    break
                
                # Process connection events (heartbeats) while waiting
                # This is the KEY to preventing connection timeout!
                try:
                    self.connection.process_data_events(time_limit=1.0)
                except Exception as e:
                    logger.warning(f"Error processing data events: {e}")
                    break
            
            # Get the result
            result = future.result(timeout=10)
            
            # Acknowledge message
            self._safe_ack(channel, delivery_tag)
            
            if result["success"]:
                logger.info(f"✅ Video {video_id} completed successfully")
            else:
                logger.error(f"❌ Video {video_id} failed: {result.get('error')}")
                
        except Exception as e:
            logger.exception(f"Error processing message: {e}")
            self._safe_nack(channel, delivery_tag)
    
    def _safe_ack(self, channel, delivery_tag):
        """Safely acknowledge a message, handling connection issues."""
        try:
            with self._lock:
                if channel.is_open:
                    channel.basic_ack(delivery_tag=delivery_tag)
                else:
                    logger.warning("Channel closed, cannot ack message")
        except (StreamLostError, ChannelWrongStateError) as e:
            logger.warning(f"Could not ack message (connection issue): {e}")
        except Exception as e:
            logger.error(f"Unexpected error acking message: {e}")
    
    def _safe_nack(self, channel, delivery_tag):
        """Safely nack a message, handling connection issues."""
        try:
            with self._lock:
                if channel.is_open:
                    channel.basic_nack(delivery_tag=delivery_tag, requeue=False)
                else:
                    logger.warning("Channel closed, cannot nack message")
        except (StreamLostError, ChannelWrongStateError) as e:
            logger.warning(f"Could not nack message (connection issue): {e}")
        except Exception as e:
            logger.error(f"Unexpected error nacking message: {e}")
    
    def close(self):
        """Clean shutdown of worker."""
        logger.info("Closing worker...")
        
        # Shutdown thread pool
        self.executor.shutdown(wait=True, cancel_futures=False)
        
        # Close RabbitMQ connection
        try:
            if self.connection and self.connection.is_open:
                self.connection.close()
        except Exception as e:
            logger.warning(f"Error closing connection: {e}")
        
        logger.info("Worker closed")
    
    def run(self):
        """
        Main run loop with automatic reconnection.
        
        If connection is lost, will attempt to reconnect and resume consuming.
        """
        while not shutdown_event.is_set():
            try:
                if not self.connect():
                    if shutdown_event.is_set():
                        break
                    logger.error("Failed to connect, retrying in 10s...")
                    time.sleep(10)
                    continue
                
                # Set up consumer
                self.channel.basic_consume(
                    queue=config.VIDEO_TRANSCODE_QUEUE,
                    on_message_callback=self.on_message
                )
                
                logger.info(
                    f"🎬 Waiting for jobs on '{config.VIDEO_TRANSCODE_QUEUE}'..."
                )
                
                # Consume messages
                while not shutdown_event.is_set():
                    try:
                        # Process events with timeout to check shutdown
                        self.connection.process_data_events(time_limit=1.0)
                    except (StreamLostError, AMQPConnectionError) as e:
                        logger.warning(f"Connection lost: {e}")
                        break
                        
            except (StreamLostError, AMQPConnectionError) as e:
                if not shutdown_event.is_set():
                    logger.warning(f"Connection error: {e}, reconnecting in 5s...")
                    time.sleep(5)
            except Exception as e:
                logger.exception(f"Unexpected error: {e}")
                if not shutdown_event.is_set():
                    time.sleep(5)
        
        self.close()


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_event.set()


def main():
    """Main entry point - starts Video Worker."""
    logger.info("Starting Video Worker...")
    logger.info(f"RabbitMQ URL: {config.RABBITMQ_URL}")
    logger.info(f"S3 Endpoint: {config.S3_ENDPOINT}")
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    worker = VideoWorker()
    
    try:
        worker.run()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        shutdown_event.set()
    finally:
        worker.close()
    
    logger.info("Video Worker stopped")
    sys.exit(0)


if __name__ == "__main__":
    main()
