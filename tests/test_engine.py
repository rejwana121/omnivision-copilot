import asyncio
from app.engine import MultimodalVisionEngine
from app.schemas import AnalyzeFrameRequest


def test_vision_engine_simulation():
    engine = MultimodalVisionEngine()
    
    # 1x1 blank image base64
    blank_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    
    async def _test():
        return await engine.analyze_frame(
            image_base64=blank_b64,
            prompt="Inspect circuit board",
            mode="hardware"
        )

    res = asyncio.run(_test())

    assert res.spoken_text is not None
    assert len(res.spoken_text) > 0
    assert len(res.annotations) > 0
    
    # Validate spatial coordinates are normalized 0..1000
    for ann in res.annotations:
        assert 0 <= ann.box.ymin <= 1000
        assert 0 <= ann.box.xmin <= 1000
        assert 0 <= ann.box.ymax <= 1000
        assert 0 <= ann.box.xmax <= 1000
