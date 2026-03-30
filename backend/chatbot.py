import os
from google import genai

def get_chatbot_response(message: str) -> str:
    """
    AgroAssistant AI using Google GenAI SDK
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return "Backend Config Error: I cannot access the AI. The developer needs to set the GEMINI_API_KEY in the backend/.env file."

    try:
        client = genai.Client(api_key=api_key)
        
        system_prompt = (
            "You are AgroAssistant, an expert agricultural AI. A farmer or user is asking you for help. "
            "Provide clear, accurate, and concise information regarding crops, diseases, farming practices, or fertilizers. "
            "If the question is completely unrelated to agriculture, politely decline to answer. "
            f"User's message: '{message}'"
        )
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=system_prompt,
        )
        return response.text
    except Exception as e:
        return f"Error connecting to Gemini API: {str(e)}"
