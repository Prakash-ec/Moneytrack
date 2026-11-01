import os
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    # Support Render's dynamic $PORT environment variable, falling back to settings
    port = int(os.environ.get("PORT", settings.port))
    host = os.environ.get("HOST", settings.host)
    print(f"Starting MoneyTrack API server on {host}:{port} ...")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
