import base64
import json
import os
import re
from pathlib import Path

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from fastapi.responses import FileResponse

ROOT = Path(__file__).resolve().parent
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
VISION_MODEL = os.getenv("VISION_MODEL", "qwen2.5vl:3b")
NUTRITION_MODEL = os.getenv("NUTRITION_MODEL", "qwen2.5:3b")
MAX_IMAGE_BYTES = 10 * 1024 * 1024

app = FastAPI(title="Calorie Tracker AI")

def ollama_chat(model: str, messages: list, *, json_mode: bool = False) -> str:
    payload = { 
        "model": model, 
        "messages": messages, 
        "stream": False, 
        "options": {"temperature": 0.2},
    }
    if json_mode: 
        payload["format"] = "json"
    try: 
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            timeout=(10, 240),
        )
        response.raise_for_status() 
        data = response.json()
        return data["message"]["content"].strip()

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=( "Could not reach Ollama. Make sure Ollama is running on this " "computer and both models are installed."
            ),
        ) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=502, 
            detail="Ollama returned an unexpected response.",
        ) from exc


def parse_model_json(content: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.I)
    try: value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            raise HTTPException(
                status_code=502,
                detail="The nutrition model did not return usable nutrition data. Please try again.",
            )
        try: value = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail="The nutrition model returned malformed data. Please try again.",
            ) from exc

    if not isinstance(value, dict):
        raise HTTPException(status_code=502, detail="The AI returned an invalid estimate.")
    return value

@app.get("/api/health")
def health():
    try: 
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        response.raise_for_status()
        installed = {item.get("name") for item in response.json().get("models", [])}
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail="Ollama is not reachable.") from exc

    missing = [name for name in (VISION_MODEL, NUTRITION_MODEL) if name not in installed]
    return {
        "status": "ok" if not missing else "models_missing",
        "vision_model": VISION_MODEL,
        "nutrition_model": NUTRITION_MODEL,
        "missing_models": missing,
    }


@app.post("/api/estimate")
async def estimate_meal(
    description: str = Form(default=""),
    image: UploadFile | None = File(default=None),
):
    description = description.strip()
    if not description and image is None:
        raise HTTPException(status_code=400, detail="Add a meal description or upload a photo.")

    food_details = description

    if image is not None:
        content_type = (image.content_type or "").lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="The uploaded file must be an image.")

        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="The uploaded image is empty.")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Choose an image smaller than 10 MB.")

        image_base64 = base64.b64encode(image_bytes).decode("ascii")
        vision_prompt = (
            "Look carefully at this meal photo. Identify only foods that are visibly "
            "supported by the image. Estimate realistic portion sizes for each item. "
            "If an ingredient or quantity is uncertain, say that it is uncertain rather "
            "than inventing it. Return a concise food list with approximate portions. "
            "Do not estimate calories or macronutrients."
        )
        visual_description = ollama_chat(
            VISION_MODEL,
            [{"role": "user", "content": vision_prompt, "images": [image_base64]}],
        )
        food_details = visual_description
        if description:
            food_details += f"\nUser's additional meal details: {description}"

    nutrition_prompt = f"""
Estimate the nutrition for this complete meal using the food and portion information.
Food and portion information:
{food_details}

Return ONLY a JSON object with exactly these keys:
{{
  "name": "short meal name including important foods and portions", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "emoji": "one suitable food emoji"
}}

Use numeric values (not strings), calories in kcal, and macronutrients in grams.
Estimate the whole described meal, not one serving unless the description says so.
Use reasonable typical nutrition values. Do not claim exact precision. If portions are
unclear, make a cautious estimate based on visible evidence. Do not add foods that
were not described or visibly identified. No markdown or extra text.
""".strip()

    raw = ollama_chat(
        NUTRITION_MODEL,
        [{"role": "user", "content": nutrition_prompt}],
        json_mode=True,
    )
    estimate = parse_model_json(raw)

    result = {"name": str(estimate.get("name") or description or "Meal estimate")}
    for key in ("calories", "protein", "carbs", "fat"):
        try:
            number = float(estimate[key])
            if number < 0 or number > (10000 if key == "calories" else 1000):
                raise ValueError
            result[key] = round(number)
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=502,
                detail="The nutrition model returned invalid numbers. Please try again.",
            )
    result["emoji"] = str(estimate.get("emoji") or "🍽️")[:8]
    result["source"] = "AI"
    return JSONResponse(result)

app.mount("/", StaticFiles(directory=ROOT, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)

@app.get("/")
async def serve_home():
    return FileResponse("index.html")