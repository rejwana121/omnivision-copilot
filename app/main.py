import asyncio
import json
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from app.config import config
from app.schemas import AnalyzeFrameRequest, VisionAnalysisResponse
from app.engine import MultimodalVisionEngine

app = FastAPI(title="OmniVision Copilot", version="1.0.0")

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

engine = MultimodalVisionEngine()


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        return HTMLResponse("<h1>OmniVision Copilot</h1><p>Loading HUD UI...</p>")
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


@app.get("/api/status")
async def get_status():
    """Returns engine readiness and provider."""
    return {
        "status": "ready",
        "has_api_key": bool(config.GEMINI_API_KEY),
        "model": config.MODEL_NAME,
        "mode": "Live Gemini Multimodal" if config.GEMINI_API_KEY else "Interactive Spatial Simulator (Ready for API Key)"
    }


@app.post("/api/analyze-frame", response_model=VisionAnalysisResponse)
async def analyze_frame(req: AnalyzeFrameRequest):
    """Processes a captured camera frame and returns spatial AR coordinates and speech text."""
    try:
        response = await engine.analyze_frame(
            image_base64=req.image_base64,
            prompt=req.prompt or "What is in front of the camera?",
            mode=req.mode or "general"
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """High-frequency WebSocket channel for continuous camera frames and real-time voice copilot."""
    await websocket.accept()
    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            
            image_base64 = data.get("image_base64", "")
            prompt = data.get("prompt", "Analyze this view.")
            mode = data.get("mode", "general")
            
            if image_base64:
                result = await engine.analyze_frame(image_base64, prompt, mode)
                await websocket.send_text(result.model_dump_json())
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=1011, reason=str(e))
