import os
import shutil
import subprocess
from abc import ABC, abstractmethod


MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class OCRUnavailableError(Exception):
    """Raised when no local OCR engine is installed or accessible."""
    pass


def validate_image_bytes(data: bytes, max_size_bytes: int = MAX_IMAGE_SIZE_BYTES) -> str:
    """Validate image bytes for format and size limit.

    Returns the detected MIME type if valid; otherwise raises ValueError.
    """
    if not data or len(data) == 0:
        raise ValueError("Image file is empty.")

    if len(data) > max_size_bytes:
        raise ValueError(
            f"Image file size ({len(data) // 1024} KB) exceeds the maximum allowed size of {max_size_bytes // (1024 * 1024)} MB."
        )

    # Magic byte checks
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp"

    raise ValueError("Unsupported image format. Allowed formats: JPEG, PNG, WebP.")


class BaseOCRProvider(ABC):
    @abstractmethod
    def extract_text(self, image_bytes: bytes) -> str:
        """Extract plain text from raw image bytes."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this OCR provider is installed and ready to process images."""
        pass


class TesseractOCRProvider(BaseOCRProvider):
    def __init__(self, custom_path: str | None = None) -> None:
        self._path = self._locate_binary(custom_path)

    @staticmethod
    def _locate_binary(custom_path: str | None = None) -> str | None:
        if custom_path and os.path.isfile(custom_path):
            return custom_path

        env_path = os.environ.get("TESSERACT_PATH")
        if env_path and os.path.isfile(env_path):
            return env_path

        which_path = shutil.which("tesseract")
        if which_path:
            return which_path

        common_windows_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        ]
        for candidate in common_windows_paths:
            if os.path.isfile(candidate):
                return candidate

        return None

    def is_available(self) -> bool:
        return self._path is not None

    def extract_text(self, image_bytes: bytes) -> str:
        if not self.is_available() or self._path is None:
            raise OCRUnavailableError(
                "Local OCR engine is not installed on this server. "
                "Use Groq AI Vision or paste the receipt text manually."
            )

        try:
            process = subprocess.run(
                [self._path, "stdin", "stdout", "--oem", "1", "-l", "eng"],
                input=image_bytes,
                capture_output=True,
                timeout=30,
                check=False,
            )
            if process.returncode != 0:
                stderr_msg = process.stderr.decode("utf-8", errors="replace").strip()
                raise OCRUnavailableError(
                    f"OCR processing failed with exit code {process.returncode}: {stderr_msg or 'unknown error'}"
                )

            return process.stdout.decode("utf-8", errors="replace").strip()
        except subprocess.TimeoutExpired as exc:
            raise OCRUnavailableError("OCR processing timed out after 30 seconds.") from exc
        except OSError as exc:
            raise OCRUnavailableError(f"Could not execute Tesseract: {exc}") from exc


_DEFAULT_PROVIDER: BaseOCRProvider | None = None


def get_ocr_provider() -> BaseOCRProvider:
    global _DEFAULT_PROVIDER
    if _DEFAULT_PROVIDER is None:
        _DEFAULT_PROVIDER = TesseractOCRProvider()
    return _DEFAULT_PROVIDER


def set_ocr_provider(provider: BaseOCRProvider | None) -> None:
    """Override provider (useful for testing or switching to an alternate engine)."""
    global _DEFAULT_PROVIDER
    _DEFAULT_PROVIDER = provider
