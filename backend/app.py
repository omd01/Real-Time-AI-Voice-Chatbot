from fastapi import FastAPI, WebSocket
import socketio
from groq import Groq
import base64
import os
import tempfile
from typing import Optional
from pydantic_settings import BaseSettings
import logging
from langchain_openai import ChatOpenAI
import openai


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    OPENAI_API_KEY: str
    GROQ_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"

# Load environment variables
settings = Settings()

# Initialize FastAPI & Socket.io
app = FastAPI()
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")
socket_app = socketio.ASGIApp(sio, app)

# Initialize API clients

llm = ChatOpenAI(api_key=settings.OPENAI_API_KEY,model="gpt-4o")

groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None


async def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Transcribe full audio file using Groq Whisper API.
    """
    if not groq_client:
        logger.error("Groq client not initialized - missing API key")
        return ""
    
    try:
        # Create a temporary WAV file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
            temp_wav.write(audio_bytes)
            temp_wav_path = temp_wav.name

        try:
            # Open and transcribe the WAV file directly
            with open(temp_wav_path, "rb") as audio_file:
                transcription = groq_client.audio.transcriptions.create(
                    file=(os.path.basename(temp_wav_path), audio_file.read()),
                    model="whisper-large-v3-turbo",
                    response_format="json",
                    language="en",
                    temperature=0.0
                )

            return transcription.text

        finally:
            # Clean up temporary WAV file
            if os.path.exists(temp_wav_path):
                os.unlink(temp_wav_path)

    except Exception as e:
        logger.error(f"Error transcribing audio: {e}")
        return ""

def get_ai_response(user_text: str) -> str:
    """
    Generate AI response from OpenAI ChatGPT.
    """
    try:
        response = llm.invoke(user_text)  # Correct way to call llm
        return response.content  # LLM response is already a string
    except Exception as e:
        logger.error(f"Error getting AI response: {e}")
        return "I couldn't process that request."


def text_to_speech(text: str) -> bytes:
    """
    Convert AI-generated text to speech using OpenAI's latest TTS API.
    """
    try:
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)  # Use OpenAI client
        response = client.audio.speech.create(
            model="tts-1",
            voice="sage",
            input=text
        )
        return response.content
    except Exception as e:
        logger.error(f"Error converting text to speech: {e}")
        return None


@sio.on("connect")
async def handle_connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.on("disconnect")
async def handle_disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

@sio.on("audio")
async def handle_audio(sid, data):
    try:
        # Decode Base64 audio data
        audio_base64 = data.split(",")[1] if "," in data else data
        audio_bytes = base64.b64decode(audio_base64)

        # Transcribe full audio
        transcribed_text = await transcribe_audio(audio_bytes)
        if not transcribed_text:
            await sio.emit("error", "Failed to transcribe audio", room=sid)
            return

        await sio.emit("transcription", transcribed_text, room=sid)

        # Get AI response
        ai_response = get_ai_response(transcribed_text)
        await sio.emit("ai_response", ai_response, room=sid)

        # Convert AI response to speech
        audio_data = text_to_speech(ai_response)
        if audio_data:
            encoded_audio = base64.b64encode(audio_data).decode("utf-8")
            await sio.emit("audio_response", encoded_audio, room=sid)
        else:
            await sio.emit("error", "Failed to generate audio response", room=sid)

    except Exception as e:
        logger.error(f"Error processing audio request: {e}")
        await sio.emit("error", "An error occurred processing your request", room=sid)

app.mount("/", socket_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)