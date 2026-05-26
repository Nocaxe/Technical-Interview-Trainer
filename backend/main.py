import os
import tempfile
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Technical Interview Trainer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model on startup
whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    problem_context: str = Form("")
):
    audio_bytes = await audio.read()

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    
    try:
        segments, _ = whisper_model.transcribe(
            tmp_path,
            initial_prompt=problem_context,
            language="en",
        )

        transcript = " ".join(segment.text for segment in segments).strip()

        return {"transcript": transcript}
    
    finally:
        os.remove(tmp_path)