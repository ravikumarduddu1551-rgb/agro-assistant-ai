# AgroAssistant AI

AgroAssistant is a premium, nature-inspired AI platform designed to help farmers detect crop diseases and get expert agricultural advice using Google's Gemini 2.5 Flash model.

## Features
- **AI Disease Detection**: Upload a photo of your crop to identify diseases with high confidence.
- **Agricultural Chatbot**: Get real-time advice on fertilizers, pests, and farming practices.
- **ChatGPT-style Persistence**: Your chat history is saved securely via Firebase Firestore.
- **Premium UI**: Fluid liquid backgrounds, glassmorphism, and neon emerald aesthetics.

## Project Structure
- **/frontend**: React + Vite application (TailwindCSS).
- **/backend**: FastAPI application (Python 3.x).

## Local Setup
1. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. **Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

## Environment Variables
Ensure you have the following keys set in your deployment environment (Vercel):
- `GEMINI_API_KEY`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_API_BASE_URL` (points to your deployed backend)
