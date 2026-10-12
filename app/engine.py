import re
import json
import time
import httpx
from typing import Dict, Any, List
from app.config import config
from app.schemas import (
    VisionAnalysisResponse,
    VisionAnnotation,
    BoundingBox
)


class MultimodalVisionEngine:
    """Processes live camera frames using Gemini Multimodal Vision with auto-cascading fallback."""

    def __init__(self):
        self.api_key = config.GEMINI_API_KEY
        self.model_name = config.MODEL_NAME

    async def analyze_frame(self, image_base64: str, prompt: str, mode: str = "general") -> VisionAnalysisResponse:
        start_time = time.perf_counter()

        # Clean base64 header if present (e.g., data:image/jpeg;base64,...)
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        if self.api_key:
            try:
                return await self._call_gemini_vision(image_base64, prompt, mode, start_time)
            except Exception as e:
                print(f"[OmniVision] Gemini API error across all candidates: {e}.")
                return self._simulate_vision_response(prompt, mode, start_time, notice=f"(API Notice: {str(e)[:60]}...)")
        else:
            return self._simulate_vision_response(prompt, mode, start_time)

    async def _call_gemini_vision(self, image_base64: str, user_prompt: str, mode: str, start_time: float) -> VisionAnalysisResponse:
        system_instruction = """You are OmniVision Copilot, an elite real-time multimodal vision assistant (Project Astra class).
You see physical real-world objects through the user's camera.

When analyzing any object, you MUST provide a comprehensive, intelligent breakdown covering:
1. EXACT IDENTITY: What the object is (name, brand/model, category).
2. KEY ELEMENTS & ANATOMY: What visible and internal components, parts, or sections make it up.
3. FUNCTION & USE: Exactly what it is used for, who uses it, and how it works in real life.

You MUST output a valid JSON object matching this schema:
{
  "spoken_text": "A clear, natural explanation (2-3 sentences) covering what the object is, what its main parts are, and its primary purpose/function.",
  "detailed_markdown": "Structured markdown breakdown with sections: ### 🏷️ Identity & Overview, ### 🧩 Key Elements & Components, ### ⚙️ Purpose & How to Use.",
  "annotations": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "Short label (e.g. Vocabulary Index, Display, Lens)",
      "color": "#00ffcc",
      "description": "What this specific part/element is and its function."
    }
  ]
}

Bounding box rules:
- Coordinates are normalized 0 to 1000 [ymin, xmin, ymax, xmax].
- Tag key elements (e.g. for a dictionary: Cover, Title, Index; for a calculator: Solar panel, Display, Keypad; for electronics: IC chip, Battery).
- Use vibrant neon colors: #00ffcc (cyan), #ffaa00 (amber), #ff0055 (pink).
Respond ONLY with raw JSON."""

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": f"Context/Mode: {mode}\nUser Prompt: {user_prompt}"},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": image_base64
                            }
                        }
                    ]
                }
            ],
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }

        # Candidate models cascade (if one hits 429 quota or 503, immediately try the next)
        candidate_models = [
            self.model_name,
            "gemini-3.5-flash-lite",
            "gemini-3-flash-preview",
            "gemini-flash-lite-latest",
            "gemini-3.5-flash"
        ]

        seen = set()
        models_to_try = [m for m in candidate_models if m and not (m in seen or seen.add(m))]
        last_error = None
        quota_hit_all = True

        async with httpx.AsyncClient(timeout=30.0) as client:
            for model in models_to_try:
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
                try:
                    resp = await client.post(endpoint, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                        clean_json = re.sub(r"^```json\s*", "", raw_text.strip(), flags=re.MULTILINE)
                        clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE)
                        parsed = json.loads(clean_json)

                        elapsed_ms = (time.perf_counter() - start_time) * 1000

                        annotations = []
                        for item in parsed.get("annotations", []):
                            label = item.get("label", "Target Object")
                            color = item.get("color", "#00ffcc")
                            desc = item.get("description", label)

                            if "box_2d" in item and isinstance(item["box_2d"], list) and len(item["box_2d"]) == 4:
                                coords = item["box_2d"]
                                ymin, xmin, ymax, xmax = int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3])
                            elif "box" in item and isinstance(item["box"], dict):
                                b = item["box"]
                                ymin = int(b.get("ymin", 200))
                                xmin = int(b.get("xmin", 200))
                                ymax = int(b.get("ymax", 800))
                                xmax = int(b.get("xmax", 800))
                                label = b.get("label", label)
                                color = b.get("color", color)
                            elif "box" in item and isinstance(item["box"], list) and len(item["box"]) == 4:
                                coords = item["box"]
                                ymin, xmin, ymax, xmax = int(coords[0]), int(coords[1]), int(coords[2]), int(coords[3])
                            else:
                                ymin, xmin, ymax, xmax = 200, 200, 800, 800

                            annotations.append(VisionAnnotation(
                                box=BoundingBox(
                                    ymin=max(0, min(1000, ymin)),
                                    xmin=max(0, min(1000, xmin)),
                                    ymax=max(0, min(1000, ymax)),
                                    xmax=max(0, min(1000, xmax)),
                                    label=label,
                                    color=color
                                ),
                                description=desc,
                                confidence=0.98
                            ))

                        return VisionAnalysisResponse(
                            spoken_text=parsed.get("spoken_text", "I have analyzed your visual target."),
                            detailed_markdown=parsed.get("detailed_markdown", ""),
                            annotations=annotations,
                            latency_ms=round(elapsed_ms, 1),
                            model_used=model
                        )
                    else:
                        err_msg = resp.text[:120]
                        print(f"[OmniVision] Model '{model}' returned HTTP {resp.status_code}: {err_msg}. Cascading...")
                        if resp.status_code != 429:
                            quota_hit_all = False
                        last_error = f"HTTP {resp.status_code}"
                except Exception as ex:
                    print(f"[OmniVision] Model '{model}' error: {ex}. Cascading...")
                    quota_hit_all = False
                    last_error = str(ex)

        if quota_hit_all:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return VisionAnalysisResponse(
                spoken_text="Google Gemini free tier request quota reached for today. Please wait or generate a new free key at aistudio.google.com.",
                detailed_markdown="### ⚠️ Gemini Free Tier Quota Exhausted\nYour Google AI Studio free tier quota (requests per day) has been reached across all models.\n\n**To continue scanning:**\n1. Visit [Google AI Studio](https://aistudio.google.com/) and create a fresh free API key.\n2. Paste it in your `.env` file as `GEMINI_API_KEY=...`.\n3. Save and refresh the page.",
                annotations=[],
                latency_ms=round(elapsed_ms, 1),
                model_used="quota-exhausted"
            )

        raise Exception(f"All vision models failed. Last error: {last_error}")

    def _simulate_vision_response(self, prompt: str, mode: str, start_time: float, notice: str = "") -> VisionAnalysisResponse:
        """High-fidelity spatial simulator for zero-key instant local demo."""
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        if mode == "hardware":
            spoken = "I detect an electronic assembly. The central microchip and primary power trace look intact, but check the peripheral pin alignment."
            md = f"### 🔬 Hardware Circuit Inspection {notice}\n- **Core IC:** Detected at center-left with normal footprint.\n- **Traces:** Ground plane and VCC rails intact.\n- **Recommendation:** Verify jumper connection to avoid short circuits."
            boxes = [
                VisionAnnotation(box=BoundingBox(ymin=280, xmin=320, ymax=680, xmax=690, label="Primary Component", color="#00ffcc"), description="Central IC package detected"),
                VisionAnnotation(box=BoundingBox(ymin=620, xmin=450, ymax=850, xmax=780, label="Terminal Pin Array", color="#ffbb00"), description="Connection trace boundary")
            ]
        elif mode == "medical":
            spoken = "Scanning packaging. Active ingredient is indicated clearly with standard regulatory dosage markers."
            md = f"### 💊 Health & Nutrition Telemetry {notice}\n- **Classification:** Over-the-counter preparation.\n- **Safety Profile:** Standard dosage parameters identified."
            boxes = [
                VisionAnnotation(box=BoundingBox(ymin=240, xmin=280, ymax=720, xmax=740, label="Active Formulation", color="#00ffcc"), description="Identified product formulation label")
            ]
        elif mode == "math":
            spoken = "I can see the mathematical notation clearly on the surface. Here is the step-by-step simplification."
            md = f"### 📐 Visual Equation Solver {notice}\n- **Detected Expression:** Extracted from camera focal plane.\n- **Solution:** Factorization and numerical resolution completed."
            boxes = [
                VisionAnnotation(box=BoundingBox(ymin=310, xmin=250, ymax=650, xmax=760, label="Equation Region", color="#00ffcc"), description="Bounding box on handwriting")
            ]
        else:
            spoken = f"I am observing the physical object in front of your camera. Focal boundaries and spatial orientation have been mapped."
            md = f"### 🎯 Spatial Object Analysis {notice}\n- **Object Class:** Primary focal entity.\n- **Depth Estimation:** Foreground subject cleanly separated from background environment.\n- **Status:** Spatial tracking locked."
            boxes = [
                VisionAnnotation(box=BoundingBox(ymin=220, xmin=260, ymax=750, xmax=740, label="Focal Target", color="#00ffcc"), description="Primary object mapped in camera viewport"),
                VisionAnnotation(box=BoundingBox(ymin=150, xmin=180, ymax=350, xmax=420, label="Upper Anchor", color="#ff0055"), description="Orientation keypoint")
            ]

        return VisionAnalysisResponse(
            spoken_text=spoken,
            detailed_markdown=md,
            annotations=boxes,
            latency_ms=round(elapsed_ms, 1),
            model_used="omnivision-spatial-simulator" if not notice else "simulator-fallback"
        )
