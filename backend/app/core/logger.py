"""
Core Logging System

A structured, production-ready logging system that provides:
- JSON-formatted logs for production (log aggregation friendly)
- Pretty console output for development
- Automatic context attachment (timestamp, module, correlation_id)
- Integration with the exception system
- Environment-based configuration
"""

import json
import logging
import sys
import traceback
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.config import settings

# =============================================================================
# Context Variables for Request Tracking
# =============================================================================

# Correlation ID for request tracing across services
correlation_id_var: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)

# Additional context that can be attached to all logs
extra_context_var: ContextVar[dict[str, Any]] = ContextVar("extra_context", default={})


def set_correlation_id(correlation_id: str) -> None:
    """Set the correlation ID for the current context."""
    correlation_id_var.set(correlation_id)


def get_correlation_id() -> Optional[str]:
    """Get the correlation ID for the current context."""
    return correlation_id_var.get()


def set_extra_context(context: dict[str, Any]) -> None:
    """Set additional context for logging."""
    extra_context_var.set(context)


def clear_context() -> None:
    """Clear all context variables."""
    correlation_id_var.set(None)
    extra_context_var.set({})


# =============================================================================
# Custom JSON Formatter
# =============================================================================

class JSONFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.
    
    Produces logs like:
    {"timestamp": "...", "level": "INFO", "module": "api.routes", "message": "...", ...}
    """
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
        }
        
        # Add correlation ID if present
        correlation_id = correlation_id_var.get()
        if correlation_id:
            log_data["correlation_id"] = correlation_id
        
        # Add extra context
        extra_context = extra_context_var.get()
        if extra_context:
            log_data["context"] = extra_context
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "stacktrace": self.formatException(record.exc_info),
            }
        
        # Add any extra attributes from the log call
        if hasattr(record, "extra_data"):
            log_data["data"] = record.extra_data
        
        return json.dumps(log_data, default=str)


class PrettyFormatter(logging.Formatter):
    """
    Human-readable formatter for development.
    
    Produces colorized, readable console output.
    """
    
    # ANSI color codes
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        
        # Format timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        
        # Build the log line
        parts = [
            f"{self.DIM}{timestamp}{self.RESET}",
            f"{color}{self.BOLD}{record.levelname:8}{self.RESET}",
            f"{self.DIM}[{record.name}]{self.RESET}",
        ]
        
        # Add correlation ID if present
        correlation_id = correlation_id_var.get()
        if correlation_id:
            parts.append(f"{self.DIM}(req:{correlation_id[:8]}){self.RESET}")
        
        # Add message
        parts.append(record.getMessage())
        
        result = " ".join(parts)
        
        # Add exception traceback if present
        if record.exc_info:
            result += f"\n{color}{self.formatException(record.exc_info)}{self.RESET}"
        
        # Add extra data if present
        if hasattr(record, "extra_data") and record.extra_data:
            result += f"\n{self.DIM}  └─ {record.extra_data}{self.RESET}"
        
        return result


# =============================================================================
# Logger Factory
# =============================================================================

def get_log_level() -> int:
    """Get the configured log level."""
    level_name = getattr(settings, "LOG_LEVEL", "INFO").upper()
    return getattr(logging, level_name, logging.INFO)


def get_log_format() -> str:
    """Get the configured log format (json or pretty)."""
    return getattr(settings, "LOG_FORMAT", "json").lower()


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a configured logger instance.
    
    Args:
        name: Logger name (usually __name__ of the calling module)
    
    Returns:
        Configured logging.Logger instance
    
    Example:
        logger = get_logger(__name__)
        logger.info("User logged in", extra={"extra_data": {"user_id": "123"}})
    """
    logger = logging.getLogger(name or "app")
    
    # Only configure if not already configured
    if not logger.handlers:
        logger.setLevel(get_log_level())
        
        # Create console handler
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(get_log_level())
        
        # Set formatter based on configuration
        if get_log_format() == "json":
            handler.setFormatter(JSONFormatter())
        else:
            handler.setFormatter(PrettyFormatter())
        
        logger.addHandler(handler)
        
        # Prevent propagation to root logger to avoid duplicate logs
        logger.propagate = False
    
    return logger


# =============================================================================
# Helper Functions for Exception Logging
# =============================================================================

def log_exception(
    logger: logging.Logger,
    exception: Exception,
    correlation_id: Optional[str] = None,
    extra_context: Optional[dict[str, Any]] = None,
) -> None:
    """
    Log an exception with full context.
    
    Args:
        logger: Logger instance
        exception: The exception to log
        correlation_id: Optional request correlation ID
        extra_context: Additional context to include
    
    Example:
        try:
            do_something()
        except SomeException as e:
            log_exception(logger, e, correlation_id="req-123")
    """
    # Set correlation ID temporarily if provided
    original_correlation_id = correlation_id_var.get()
    if correlation_id:
        correlation_id_var.set(correlation_id)
    
    try:
        # Build log data
        log_data: dict[str, Any] = {}
        
        # Check if it's our custom exception type
        from app.core.exceptions import BaseAppException
        
        if isinstance(exception, BaseAppException):
            log_data = exception.to_dict(include_debug=True)
            log_data["exception_type"] = exception.__class__.__name__
            log_data["http_status_code"] = exception.http_status_code
        else:
            log_data = {
                "exception_type": exception.__class__.__name__,
                "message": str(exception),
            }
        
        # Add extra context
        if extra_context:
            log_data["context"] = extra_context
        
        # Log with appropriate level
        if isinstance(exception, BaseAppException):
            if exception.http_status_code >= 500:
                logger.error(
                    f"{exception.__class__.__name__}: {exception.message}",
                    exc_info=exception,
                    extra={"extra_data": log_data}
                )
            else:
                logger.warning(
                    f"{exception.__class__.__name__}: {exception.message}",
                    extra={"extra_data": log_data}
                )
        else:
            logger.error(
                f"Unexpected error: {exception}",
                exc_info=exception,
                extra={"extra_data": log_data}
            )
    finally:
        # Restore original correlation ID
        correlation_id_var.set(original_correlation_id)


def log_business_error(
    logger: logging.Logger,
    error_code: str,
    message: str,
    metadata: Optional[dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
) -> None:
    """
    Log a business error without raising an exception.
    
    Useful for logging errors that are handled gracefully.
    
    Args:
        logger: Logger instance
        error_code: Machine-readable error code
        message: Human-readable message
        metadata: Additional context
        correlation_id: Optional request correlation ID
    
    Example:
        log_business_error(
            logger,
            "DUPLICATE_EMAIL",
            "Email already registered",
            {"email": "user@example.com"}
        )
    """
    original_correlation_id = correlation_id_var.get()
    if correlation_id:
        correlation_id_var.set(correlation_id)
    
    try:
        log_data = {
            "error_code": error_code,
            "message": message,
        }
        if metadata:
            log_data["metadata"] = metadata
        
        logger.warning(
            f"Business error [{error_code}]: {message}",
            extra={"extra_data": log_data}
        )
    finally:
        correlation_id_var.set(original_correlation_id)


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "get_logger",
    "log_exception",
    "log_business_error",
    "set_correlation_id",
    "get_correlation_id",
    "set_extra_context",
    "clear_context",
    "correlation_id_var",
]
