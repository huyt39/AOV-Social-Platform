"""Video Worker main entry point.

RabbitMQ consumer that:
1. Listens for transcode jobs
2. Downloads raw video from S3
3. Processes with FFmpeg (transcode + HLS)
4. Uploads results to S3
5. Notifies backend API
"""

import json
import logging
import time
import requests
import pika
from pika.exceptions import AMQPConnectionError

from config import config
from processor import VideoProcessor
from s3_client import s3_client

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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


def on_message(channel, method, properties, body):
    """Handle incoming RabbitMQ message."""
    try:
        message = json.loads(body.decode())
        video_id = message.get("video_id")
        raw_key = message.get("raw_key")
        
        if not video_id or not raw_key:
            logger.error(f"Invalid message: {message}")
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        logger.info(f"Received job for video: {video_id}")
        
        # Process the video
        result = process_video(video_id, raw_key)
        
        # Notify backend
        notify_backend(video_id, result)
        
        # Acknowledge message
        channel.basic_ack(delivery_tag=method.delivery_tag)
        
        if result["success"]:
            logger.info(f"✅ Video {video_id} completed successfully")
        else:
            logger.error(f"❌ Video {video_id} failed: {result.get('error')}")
            
    except Exception as e:
        logger.exception(f"Error processing message: {e}")
        # Reject and requeue on error
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    """Main entry point - starts RabbitMQ consumer."""
    logger.info("Starting Video Worker...")
    logger.info(f"RabbitMQ URL: {config.RABBITMQ_URL}")
    logger.info(f"S3 Endpoint: {config.S3_ENDPOINT}")
    
    # Retry connection with backoff
    max_retries = 10
    retry_delay = 5
    
    for attempt in range(max_retries):
        try:
            # Connect to RabbitMQ
            parameters = pika.URLParameters(config.RABBITMQ_URL)
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declare queue
            channel.queue_declare(queue=config.VIDEO_TRANSCODE_QUEUE, durable=True)
            
            # Set prefetch count (process one at a time)
            channel.basic_qos(prefetch_count=1)
            
            # Start consuming
            channel.basic_consume(
                queue=config.VIDEO_TRANSCODE_QUEUE,
                on_message_callback=on_message
            )
            
            logger.info(f"✅ Connected to RabbitMQ, waiting for jobs on '{config.VIDEO_TRANSCODE_QUEUE}'...")
            channel.start_consuming()
            
        except AMQPConnectionError as e:
            logger.warning(f"RabbitMQ connection failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                logger.error("Max retries reached, exiting")
                raise
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break


if __name__ == "__main__":
    main()
