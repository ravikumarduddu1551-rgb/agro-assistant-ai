from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

from ml_model import predict_disease
from chatbot import get_chatbot_response, generate_chat_title

app = FastAPI(title="AgroAssistant API")

class TitleRequest(BaseModel):
    message: str

@app.post("/api/generate_title")
async def generate_title(request: TitleRequest):
    title = generate_chat_title(request.message)
    return {"title": title}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Use /tmp for serverless environments like Vercel
UPLOADS_DIR = "/tmp/uploads" if os.environ.get("VERCEL") else "../uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    message: str
    user_id: str

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), user_id: str = Form(...)):
    # Save the file locally
    file_ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(UPLOADS_DIR, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Run prediction
    prediction_result = predict_disease(file_path)
    
    return {
        "status": "success",
        "file_path": f"uploads/{filename}",
        "prediction": prediction_result
    }

@app.post("/api/chat")
async def chat(request: ChatRequest):
    response = get_chatbot_response(request.message)
    return {
        "response": response
    }

@app.get("/")
def read_root():
    return {"message": "AgroAssistant Backend is running"}




