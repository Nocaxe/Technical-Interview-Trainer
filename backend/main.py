import os
import tempfile
import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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

# Load Whisper model and Anthropic client once on startup
whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")
anthropic_client = anthropic.Anthropic()

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

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    current_code: str
    problem_description: str

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

@app.post("/chat")
async def chat(request: ChatRequest):
    messages_for_claude = []

    for i, msg in enumerate(request.messages):
        # Append code snapshot on the final user message
        if i == len(request.messages) - 1 and msg.role == "user":
            content = f"{msg.content}\n\n[Current code in editor:]\n{request.current_code}"
        else:
            content = msg.content
        
        messages_for_claude.append({"role": msg.role, "content": content})

        # Prepend problem description to the system prompt
        full_system_prompt = f"{INTERVIEWER_SYSTEM_PROMPT}\n\n[Problem description:]\n{request.problem_description}"

        response = anthropic_client.messages.create(
            model = "claude-sonnet-4-6",
            max_tokens = 1024,
            system = full_system_prompt,
            messages = messages_for_claude
        )

        reply = response.content[0].text

        # Check if the interview is complete
        interview_complete = "[INTERVIEW_COMPLETE]" in reply

        # Remove the token from the reply before sending it back to the frontend
        cleaned_reply = reply.replace("[INTERVIEW_COMPLETE]", "").strip()

        return {
            "reply": cleaned_reply,
            "interview_complete": interview_complete
        }