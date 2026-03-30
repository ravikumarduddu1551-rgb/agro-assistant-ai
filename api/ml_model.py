import os
import json
from google import genai
from PIL import Image

def predict_disease(image_path: str):
    """
    Real implementation using Google Gemini 2.0 Flash Vision for Crop Disease Detection.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    default_error = {
        "crop": "Error",
        "disease": "Missing API Key",
        "symptoms": "The GEMINI_API_KEY is not set in the backend .env file.",
        "cure": "Add your Google Gemini API key to backend/.env and restart the server.",
        "prevention": "-",
        "confidence": 0.0
    }
    
    if not api_key or api_key == "your_gemini_api_key_here":
        return default_error

    try:
        client = genai.Client(api_key=api_key)
        
        img = Image.open(image_path)
        
        prompt = '''
        You are an expert plant pathologist AI. Examine this image.
        If it is NOT a plant or crop, return JSON with "crop": "Unknown", "disease": "Not a plant", "symptoms": "N/A", "cure": "N/A", "prevention": "N/A", "confidence": 1.0.
        If it is a plant, identify the crop, the disease (or state 'Healthy'), symptoms, cure, and prevention methods.
        You MUST return ONLY valid JSON in the exact following structure without any markdown formatting or code blocks:
        {
            "crop": "crop name",
            "disease": "disease name",
            "symptoms": "detailed symptoms",
            "cure": "treatment methodology",
            "prevention": "preventative measures",
            "confidence": 0.95
        }
        '''
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, img]
        )
        response_text = response.text.strip()
        
        if response_text.startswith("```json"):
            response_text = response_text[7:-3]
        elif response_text.startswith("```"):
            response_text = response_text[3:-3]
            
        data = json.loads(response_text)
        data["confidence"] = float(data.get("confidence", 0.95))
        return data
        
    except Exception as e:
        return {
            "crop": "Error",
            "disease": "API/Parsing Error",
            "symptoms": f"Failed to get or parse response from Gemini: {str(e)}",
            "cure": "Check backend logs.",
            "prevention": "-",
            "confidence": 0.0
        }
