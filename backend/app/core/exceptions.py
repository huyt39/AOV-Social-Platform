"""
Core Exception System

A clean, framework-independent exception hierarchy for the application.
These exceptions are designed to be:
- Reusable across all services
- Independent from FastAPI/HTTP concerns
- Easy to map to HTTP responses when needed
- Rich with debugging context
"""

from datetime import datetime, timezone
from typing import Any, Optional


class BaseAppException(Exception):
    """
    Base application exception.
    
    All custom exceptions should inherit from this class.
    
    Attributes:
        error_code: Machine-readable error identifier (e.g., "USER_NOT_FOUND")
        message: Human-readable message safe for API responses
        debug_message: Internal details for logging (not exposed to clients)
        metadata: Optional dictionary with additional context
        http_status_code: Suggested HTTP status code for response mapping
        timestamp: When the exception was created
    """
    
    http_status_code: int = 500  # Default to internal server error
    
    def __init__(
        self,
        error_code: str,
        message: str,
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
    ) -> None:
        self.error_code = error_code
        self.message = message
        self.debug_message = debug_message
        self.metadata = metadata or {}
        self.timestamp = datetime.now(timezone.utc)
        super().__init__(message)
    
    def to_dict(self, include_debug: bool = False) -> dict[str, Any]:
        """
        Serialize exception to dictionary.
        
        Args:
            include_debug: Whether to include debug_message (for logging)
        
        Returns:
            Dictionary representation of the exception
        """
        result = {
            "error_code": self.error_code,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
        }
        
        if self.metadata:
            result["metadata"] = self.metadata
        
        if include_debug and self.debug_message:
            result["debug_message"] = self.debug_message
        
        return result
    
    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"error_code={self.error_code!r}, "
            f"message={self.message!r}, "
            f"metadata={self.metadata!r})"
        )


# =============================================================================
# Client Errors (4xx)
# =============================================================================

class ValidationException(BaseAppException):
    """
    Validation error for invalid input data.
    
    HTTP Status: 400 Bad Request
    
    Use when:
    - Request payload is malformed
    - Required fields are missing
    - Field values don't meet validation rules
    """
    
    http_status_code = 400
    
    def __init__(
        self,
        error_code: str = "VALIDATION_ERROR",
        message: str = "Validation failed",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
        field: Optional[str] = None,
    ) -> None:
        if field and metadata is None:
            metadata = {"field": field}
        elif field:
            metadata["field"] = field
        super().__init__(error_code, message, metadata, debug_message)


class BusinessException(BaseAppException):
    """
    Business logic error.
    
    HTTP Status: 400 Bad Request
    
    Use when:
    - Business rules are violated
    - Operation is not allowed due to current state
    - Domain-specific constraints are not met
    """
    
    http_status_code = 400


class UnauthorizedException(BaseAppException):
    """
    Authentication error.
    
    HTTP Status: 401 Unauthorized
    
    Use when:
    - User is not authenticated
    - Token is missing, expired, or invalid
    - Credentials are incorrect
    """
    
    http_status_code = 401
    
    def __init__(
        self,
        error_code: str = "UNAUTHORIZED",
        message: str = "Authentication required",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
    ) -> None:
        super().__init__(error_code, message, metadata, debug_message)


class ForbiddenException(BaseAppException):
    """
    Authorization error.
    
    HTTP Status: 403 Forbidden
    
    Use when:
    - User is authenticated but lacks permission
    - Resource access is denied
    - Action is not allowed for the user's role
    """
    
    http_status_code = 403
    
    def __init__(
        self,
        error_code: str = "FORBIDDEN",
        message: str = "Permission denied",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
    ) -> None:
        super().__init__(error_code, message, metadata, debug_message)


class NotFoundException(BaseAppException):
    """
    Resource not found error.
    
    HTTP Status: 404 Not Found
    
    Use when:
    - Requested resource doesn't exist
    - Entity lookup fails
    - Route or endpoint doesn't exist
    """
    
    http_status_code = 404
    
    def __init__(
        self,
        error_code: str = "NOT_FOUND",
        message: str = "Resource not found",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
    ) -> None:
        if resource_type or resource_id:
            metadata = metadata or {}
            if resource_type:
                metadata["resource_type"] = resource_type
            if resource_id:
                metadata["resource_id"] = resource_id
        super().__init__(error_code, message, metadata, debug_message)


class ConflictException(BaseAppException):
    """
    Resource conflict error.
    
    HTTP Status: 409 Conflict
    
    Use when:
    - Resource already exists (duplicate)
    - Concurrent modification conflict
    - State transition is invalid
    """
    
    http_status_code = 409
    
    def __init__(
        self,
        error_code: str = "CONFLICT",
        message: str = "Resource conflict",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
    ) -> None:
        super().__init__(error_code, message, metadata, debug_message)


# =============================================================================
# Server Errors (5xx)
# =============================================================================

class InternalServerException(BaseAppException):
    """
    Internal server error.
    
    HTTP Status: 500 Internal Server Error
    
    Use when:
    - Unexpected server-side error occurs
    - External service fails
    - Database error occurs
    """
    
    http_status_code = 500
    
    def __init__(
        self,
        error_code: str = "INTERNAL_ERROR",
        message: str = "An internal error occurred",
        metadata: Optional[dict[str, Any]] = None,
        debug_message: Optional[str] = None,
    ) -> None:
        super().__init__(error_code, message, metadata, debug_message)


# =============================================================================
# Exception Type Registry
# =============================================================================

# Mapping of HTTP status codes to exception types for easy lookup
EXCEPTION_BY_STATUS = {
    400: ValidationException,
    401: UnauthorizedException,
    403: ForbiddenException,
    404: NotFoundException,
    409: ConflictException,
    500: InternalServerException,
}

# All exception types for easy import
__all__ = [
    "BaseAppException",
    "ValidationException",
    "BusinessException",
    "UnauthorizedException",
    "ForbiddenException",
    "NotFoundException",
    "ConflictException",
    "InternalServerException",
    "EXCEPTION_BY_STATUS",
]
