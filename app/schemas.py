from typing import List, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Normalized spatial box coordinates (0-1000 scale)."""
    ymin: int = Field(..., ge=0, le=1000)
    xmin: int = Field(..., ge=0, le=1000)
    ymax: int = Field(..., ge=0, le=1000)
    xmax: int = Field(..., ge=0, le=1000)
    label: str
    color: Optional[str] = "#00ffcc"


class VisionAnnotation(BaseModel):
    """Detected visual target with spatial coordinates and insight."""
    box: BoundingBox
    description: str
    confidence: float = 0.95


class VisionAnalysisResponse(BaseModel):
    """Complete multimodal response with speech text and AR overlays."""
    spoken_text: str = Field(..., description="Concise conversational answer for Voice TTS")
    detailed_markdown: str = Field(..., description="Detailed technical breakdown")
    annotations: List[VisionAnnotation] = Field(default_factory=list)
    latency_ms: float = 0.0
    model_used: str = "omnivision-engine"


class AnalyzeFrameRequest(BaseModel):
    """Payload containing base64 image frame and user query."""
    image_base64: str
    prompt: Optional[str] = "What are you looking at? Analyze this object and point out key components."
    mode: Optional[str] = "general"  # general, hardware, medical, math, security
