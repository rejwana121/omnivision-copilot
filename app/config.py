import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Load .env file
load_dotenv(Path(__file__).parent.parent / ".env")


class Config:
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    MODEL_NAME: str = os.getenv("MODEL_NAME", "gemini-3.5-flash")
    PORT: int = int(os.getenv("PORT", 8080))
    SIMULATOR_MODE: bool = not bool(GEMINI_API_KEY)


config = Config()
