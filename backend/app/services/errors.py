class NotFoundError(Exception):
    def __init__(self, message: str = "Resource not found") -> None:
        self.message = message
        super().__init__(message)


class ConflictError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class PeriodError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ValidationError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)
