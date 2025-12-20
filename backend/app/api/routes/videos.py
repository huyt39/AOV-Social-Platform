"""Video upload and processing API routes.

Provides endpoints for:
- Requesting pre-signed upload URLs
- Marking uploads complete
- Worker callbacks after processing
- Fetching video metadata
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Header

from app.api.deps import CurrentUser
from app.core.config import settings
from app.models import (
    Video, VideoStatus,
    VideoUploadRequest, VideoUploadResponse,
    VideoCompleteRequest, VideoProcessedRequest,
    VideoPublic
)
from app.services.clawcloud_s3 import clawcloud_s3
from app.services.rabbitmq import rabbitmq_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/videos", tags=["videos"])


@router.post("/upload-request", response_model=VideoUploadResponse)
async def request_video_upload(
    request: VideoUploadRequest,
    current_user: CurrentUser,
) -> VideoUploadResponse:
    """
    Request a pre-signed URL for direct video upload to S3.
    
    Flow:
    1. Client calls this endpoint with filename
    2. Backend generates video_id and pre-signed PUT URL
    3. Client uploads directly to S3 using the URL
    4. Client calls /videos/{video_id}/complete when done
    """
    import uuid
    
    # Generate video ID
    video_id = str(uuid.uuid4())
    
    # Generate S3 key
    s3_key = clawcloud_s3.generate_raw_key(video_id, request.filename)
    
    # Generate pre-signed PUT URL (1 hour expiry)
    upload_url = await clawcloud_s3.generate_presigned_put_url(
        s3_key=s3_key,
        content_type=request.content_type,
        expires_in=3600
    )
    
    # Create video record in database
    video = Video(
        id=video_id,
        user_id=current_user.id,
        raw_key=s3_key,
        status=VideoStatus.PENDING
    )
    await video.insert()
    
    logger.info(f"Created upload request for video {video_id} by user {current_user.id}")
    
    return VideoUploadResponse(
        video_id=video_id,
        upload_url=upload_url,
        s3_key=s3_key
    )


@router.post("/{video_id}/complete")
async def complete_video_upload(
    video_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Mark video upload as complete and trigger processing.
    
    Called by client after direct S3 upload is finished.
    This pushes a job to RabbitMQ for the video worker.
    """
    logger.info(f"🎬 [Complete] Received complete request for video {video_id}")
    
    # Find video
    video = await Video.find_one(Video.id == video_id)
    
    if not video:
        logger.error(f"❌ [Complete] Video {video_id} not found in database")
        raise HTTPException(status_code=404, detail="Video not found")
    
    logger.info(f"📝 [Complete] Found video: {video_id}, raw_key: {video.raw_key}, status: {video.status}")
    
    if video.user_id != current_user.id:
        logger.error(f"❌ [Complete] User {current_user.id} not authorized for video {video_id}")
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if video.status != VideoStatus.PENDING:
        logger.error(f"❌ [Complete] Video {video_id} not pending (status: {video.status})")
        raise HTTPException(
            status_code=400, 
            detail=f"Video is not pending upload (status: {video.status})"
        )
    
    # Verify file exists in S3
    logger.info(f"☁️ [Complete] Checking if file exists in S3: {settings.S3_RAW_BUCKET}/{video.raw_key}")
    exists = await clawcloud_s3.check_file_exists(
        bucket=settings.S3_RAW_BUCKET,
        s3_key=video.raw_key
    )
    
    if not exists:
        logger.error(f"❌ [Complete] Video file not found in S3: {settings.S3_RAW_BUCKET}/{video.raw_key}")
        raise HTTPException(
            status_code=400,
            detail="Video file not found in storage. Upload may have failed."
        )
    
    logger.info(f"✅ [Complete] File exists in S3")
    
    # Update status
    video.status = VideoStatus.PROCESSING
    video.uploaded_at = datetime.utcnow()
    await video.save()
    logger.info(f"📝 [Complete] Updated video status to PROCESSING")
    
    # Push job to RabbitMQ
    logger.info(f"📨 [RabbitMQ] Pushing transcode job for video {video_id}, raw_key: {video.raw_key}")
    success = await rabbitmq_service.publish_transcode(video_id, video.raw_key)
    
    if not success:
        logger.error(f"❌ [RabbitMQ] Failed to push job to queue for video {video_id}")
        # Rollback status on queue failure
        video.status = VideoStatus.PENDING
        await video.save()
        raise HTTPException(
            status_code=500,
            detail="Failed to queue video for processing"
        )
    
    logger.info(f"✅ [RabbitMQ] Job pushed successfully! Video {video_id} queued for processing")
    logger.info(f"🎉 [Complete] Video {video_id} marked complete, processing queued")
    
    return {
        "success": True,
        "video_id": video_id,
        "status": VideoStatus.PROCESSING
    }


@router.post("/internal/{video_id}/processed")
async def video_processed_callback(
    video_id: str,
    request: VideoProcessedRequest,
    x_internal_token: str = Header(default=""),
) -> dict[str, Any]:
    """
    Internal callback from video worker after processing.
    
    This endpoint is called by the video-worker service when transcoding
    is complete or has failed.
    
    Note: In production, validate x_internal_token for security.
    """
    # Find video
    video = await Video.find_one(Video.id == video_id)
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    if request.success:
        # Update with processing results
        video.status = VideoStatus.READY
        video.duration = request.duration
        video.resolutions = request.resolutions
        video.play_url = request.play_url
        video.thumbnail_url = request.thumbnail_url
        video.processed_at = datetime.utcnow()
        
        logger.info(f"Video {video_id} processing completed successfully")
        
        # Also update any Posts that reference this video
        try:
            from app.models import Post
            # Find posts that contain a media item with this video's ID in the URL
            # The raw URL typically contains the video ID: .../raw/{video_id}.mp4
            # We want to replace it with the HLS URL
            
            # This is a bit expensive but necessary given the current schema
            posts = await Post.find(
                {"media.url": {"$regex": video_id}}
            ).to_list()
            
            for post in posts:
                updated = False
                for media in post.media:
                    if media.type == "video" and video_id in media.url:
                        media.url = request.play_url
                        if request.thumbnail_url:
                            media.thumbnail_url = request.thumbnail_url
                        updated = True
                
                if updated:
                    await post.save()
                    logger.info(f"Updated Post {post.id} with new video URL")
                    
        except Exception as e:
            logger.error(f"Failed to update related posts for video {video_id}: {e}")
        
        # Update related Reels with processed video URL
        try:
            from app.models import Reel
            reels = await Reel.find(Reel.video_id == video_id).to_list()
            
            for reel in reels:
                reel.video_url = request.play_url
                reel.thumbnail_url = request.thumbnail_url or reel.thumbnail_url
                reel.video_processed = True
                reel.duration = request.duration or reel.duration
                await reel.save()
                logger.info(f"Updated Reel {reel.id} with processed video URL")
                
        except Exception as e:
            logger.error(f"Failed to update related reels for video {video_id}: {e}")

    else:
        # Mark as failed
        video.status = VideoStatus.FAILED
        video.error_message = request.error_message
        
        logger.error(f"Video {video_id} processing failed: {request.error_message}")
    
    await video.save()
    
    return {
        "success": True,
        "video_id": video_id,
        "status": video.status
    }


@router.get("/{video_id}", response_model=VideoPublic)
async def get_video(
    video_id: str,
    current_user: CurrentUser,
) -> VideoPublic:
    """
    Get video metadata and playback URLs.
    """
    video = await Video.find_one(Video.id == video_id)
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return VideoPublic(
        id=video.id,
        user_id=video.user_id,
        status=video.status,
        duration=video.duration,
        resolutions=video.resolutions,
        play_url=video.play_url,
        thumbnail_url=video.thumbnail_url,
        created_at=video.created_at,
        processed_at=video.processed_at
    )


@router.get("/{video_id}/status")
async def get_video_status(
    video_id: str,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Get video processing status (for polling).
    """
    video = await Video.find_one(Video.id == video_id)
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    response = {
        "video_id": video_id,
        "status": video.status,
    }
    
    if video.status == VideoStatus.READY:
        response["play_url"] = video.play_url
        response["thumbnail_url"] = video.thumbnail_url
    elif video.status == VideoStatus.FAILED:
        response["error"] = video.error_message
    
    return response
