import os
import tempfile
import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.background import BackgroundTasks
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
from kokoro import KPipeline
import numpy as np
from pydantic import BaseModel
import soundfile as sf
from typing import List

load_dotenv()

app = FastAPI(title="Technical Interview Trainer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper model, Anthropic client, and Kokoro TTS model once on startup
print("Loading models...")
whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")
anthropic_client = anthropic.Anthropic()
kokoro_pipeline = KPipeline(lang_code="a")
print("Models loaded successfully.")

INTERVIEWER_SYSTEM_PROMPT = """
You are a senior software engineer conducting a technical interview. 
Your job is to evaluate the candidate's problem-solving ability, 
communication, and code quality — not to teach them.

Your behavioral rules:
- NEVER give away the solution or write code for the candidate.
- Ask probing questions about time/space complexity, edge cases, and 
  alternative approaches. One question at a time — don't overwhelm them.
- If the candidate is clearly on the right track, acknowledge it briefly 
  and ask what they'd do next.
- Only offer a hint if the candidate explicitly asks for one, or if they've 
  been stuck on the same wrong approach for several turns. Even then, make 
  the hint a nudge ("What if you used a hash map to store..."), not a solution.
- Keep your responses concise — a real interviewer speaks in short bursts, 
  not paragraphs.
- When the candidate has arrived at a working, explained solution, wrap up 
  the interview naturally (e.g., "That looks good. I think we're done here.") 
  and end your message with the exact token: [INTERVIEW_COMPLETE]
"""

DEBRIEF_SYSTEM_PROMPT = """
You are an experienced software engineering mentor reviewing a completed mock interview.
You have the full transcript of the session and the candidate's final code.

Produce a structured debrief covering exactly these five areas:

1. **Solution Correctness** — Did the final code solve the problem? 
   Were there bugs or missed edge cases?
2. **Time & Space Complexity** — What is the Big-O complexity of their 
   solution? Did they analyse it correctly? Was there a more optimal approach they missed?
3. **Communication** — Did they explain their thinking clearly as they coded?
   Did they ask good clarifying questions at the start?
4. **What Went Well** — Be specific. Generic praise isn't useful.
5. **Top Areas to Improve** — Concrete, actionable, prioritized.

Be honest and direct. The goal is growth, not comfort.
"""

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    current_code: str
    problem_description: str

class DebriefRequest(BaseModel):
    messages: List[Message]
    final_code: str
    problem_description: str

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    problem_context: str = Form("")
):
    # Get audio bytes
    audio_bytes = await audio.read()

    # Create temp file of the audio
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    
    try:
        # Get generator of transcribed segments
        segments, _ = whisper_model.transcribe(
            tmp_path,
            initial_prompt=problem_context,
            language="en",
        )

        # Join all segments together
        transcript = " ".join(segment.text for segment in segments).strip()

        return {"transcript": transcript}
    
    finally:
        os.remove(tmp_path)

@app.post("/chat")
async def chat(request: ChatRequest):
    messages_for_claude = []

    for i, msg in enumerate(request.messages):
        # Append code snapshot on the final user message
        if i == len(request.messages) - 1 and msg.role == "user":
            content = (
                f"{msg.content}\n\n"
                f"[Current code in editor:]\n{request.current_code}"
            )
        else:
            content = msg.content
        
        messages_for_claude.append({"role": msg.role, "content": content})

        # Prepend problem description to the system prompt
        full_system_prompt = (
            f"{INTERVIEWER_SYSTEM_PROMPT}\n\n"
            f"[Problem description:]\n{request.problem_description}"
        )

        # Send message to claude and get response
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=full_system_prompt,
            messages=messages_for_claude
        )

        # Get text of response
        reply = response.content[0].text

        # Check if the interview is complete
        interview_complete = "[INTERVIEW_COMPLETE]" in reply

        # Remove the token from the reply before sending it back to the frontend
        cleaned_reply = reply.replace("[INTERVIEW_COMPLETE]", "").strip()

        return {
            "reply": cleaned_reply,
            "interview_complete": interview_complete
        }
    
@app.post("/speak")
async def speak(text: dict, background_tasks: BackgroundTasks):
    audio_segments = []
    
    # Append all audio segments from the pipeline
    for _, _, audio in kokoro_pipeline(text["text"], voice="af_heart", speed=1.0):
        audio_segments.append(audio)
    
    # Concatenate all segments together into one array
    full_audio = np.concatenate(audio_segments)

    # Write the audio to a temp file as WAV
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, full_audio, samplerate=24000)
        tmp_path = tmp.name
    
    #Schedule deletion to happen after the response is fully sent
    background_tasks.add_task(os.unlink, tmp_path)
    
    return FileResponse(
        tmp_path,
        media_type="audio/wav",
        filename="speech.wav"
    )

@app.post("/debrief")
async def debrief(request: DebriefRequest):
    conversation_text = "\n".join(
        f"{msg.role.upper()}: {msg.content}"
        for msg in request.messages
    )

    message_for_claude = (
        f"Problem Description:\n{request.problem_description}\n\n"
        f"Full interview transcript:\n{conversation_text}\n\n"
        f"Candidate's final code:\n```\n{request.final_code}\n```\n\n"
        f"Please provide the structured debrief."
    )

    response = anthropic_client.messages.create(
        model = "claude-sonnet-4-6",
        max_tokens=2048,
        system=DEBRIEF_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": message_for_claude}]
    )

    return {"debrief": response.content[0].text}