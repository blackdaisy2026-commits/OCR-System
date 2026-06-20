import time
import io
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

app = FastAPI(title="LuminaOCR API")

# Add CORS middleware for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global holder for lazy initialization of RapidOCR
_ocr_engine = None

def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            # Initialize with default parameters (downloads models to user home folder if needed)
            _ocr_engine = RapidOCR()
        except ImportError:
            raise HTTPException(
                status_code=500, 
                detail="rapidocr-onnxruntime is not installed. Please check server requirements."
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to initialize OCR engine: {str(e)}"
            )
    return _ocr_engine

@app.get("/api/health")
def health_check():
    """Simple API health check endpoint."""
    return {"status": "healthy", "service": "LuminaOCR"}

@app.post("/api/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    """
    Accepts an uploaded image file, processes it via RapidOCR,
    and returns bounding box coordinates, text strings, and confidence metrics.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        # Read the file into memory and open using PIL
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not open image file: {str(e)}")

    width, height = image.size
    
    start_time = time.time()
    try:
        engine = get_ocr_engine()
        # RapidOCR accepts file bytes directly
        result, elapse = engine(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
    
    total_time = time.time() - start_time

    # Parse and structure the results
    # Output format from RapidOCR is typical: [[box, text, confidence], ...]
    # where box is [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]
    detected_elements = []
    full_text_lines = []

    if result:
        for item in result:
            box = item[0]
            text = item[1]
            confidence = float(item[2])
            
            detected_elements.append({
                "box": box,
                "text": text,
                "confidence": confidence
            })
            full_text_lines.append(text)

    # Calculate average confidence
    avg_confidence = 0.0
    if detected_elements:
        avg_confidence = sum(item["confidence"] for item in detected_elements) / len(detected_elements)

    return {
        "status": "success",
        "data": {
            "elements": detected_elements,
            "full_text": "\n".join(full_text_lines),
            "stats": {
                "word_count": sum(len(item["text"].split()) for item in detected_elements),
                "line_count": len(detected_elements),
                "avg_confidence": avg_confidence,
                "inference_seconds": total_time,
                "image_width": width,
                "image_height": height
            }
        }
    }

# Ensure the static directory exists before mounting
os.makedirs("static", exist_ok=True)

# Mount the static files directory at the root path (/)
# This handles the index.html and other static assets automatically
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start the server on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
