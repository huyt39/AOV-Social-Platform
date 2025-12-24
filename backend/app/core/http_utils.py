"""
HTTP Utilities

Utilities for integrating the exception system with FastAPI.
This module provides the bridge between framework-independent exceptions
and HTTP responses.
"""

from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.exceptions import BaseAppException
from app.core.logger import get_logger, log_exception, get_correlation_id

logger = get_logger(__name__)


def exception_to_http_response(exc: BaseAppException) -> HTTPException:
    """
    Convert a BaseAppException to a FastAPI HTTPException.
    
    Args:
        exc: The application exception
    
    Returns:
        FastAPI HTTPException with appropriate status code and detail
    
    Example:
        try:
            user = get_user(user_id)
        except NotFoundException as e:
            raise exception_to_http_response(e)
    """
    return HTTPException(
        status_code=exc.http_status_code,
        detail={
            "error_code": exc.error_code,
            "message": exc.message,
            "metadata": exc.metadata if exc.metadata else None,
        }
    )


async def app_exception_handler(request: Request, exc: BaseAppException) -> JSONResponse:
    """
    FastAPI exception handler for BaseAppException.
    
    Register this handler in your FastAPI app to automatically convert
    all BaseAppException instances to proper HTTP responses.
    
    Usage:
        from fastapi import FastAPI
        from app.core.http_utils import app_exception_handler
        from app.core.exceptions import BaseAppException
        
        app = FastAPI()
        app.add_exception_handler(BaseAppException, app_exception_handler)
    
    Args:
        request: The FastAPI request
        exc: The application exception
    
    Returns:
        JSONResponse with error details
    """
    # Log the exception
    correlation_id = get_correlation_id()
    log_exception(logger, exc, correlation_id=correlation_id)
    
    # Build response body
    response_body: dict[str, Any] = {
        "success": False,
        "error": {
            "code": exc.error_code,
            "message": exc.message,
        }
    }
    
    # Include metadata if present
    if exc.metadata:
        response_body["error"]["metadata"] = exc.metadata
    
    return JSONResponse(
        status_code=exc.http_status_code,
        content=response_body,
    )


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200,
) -> JSONResponse:
    """
    Create a standardized success response.
    
    Args:
        data: Response data payload
        message: Success message
        status_code: HTTP status code (default 200)
    
    Returns:
        JSONResponse with standardized format
    
    Example:
        return success_response({"user": user_data}, "User created")
    """
    response_body: dict[str, Any] = {
        "success": True,
        "message": message,
    }
    
    if data is not None:
        response_body["data"] = data
    
    return JSONResponse(
        status_code=status_code,
        content=response_body,
    )


__all__ = [
    "exception_to_http_response",
    "app_exception_handler",
    "success_response",
]
