POST https://api.groq.com/openai/v1/chat/completions
Authorization: Bearer {{GROQ_API_KEY}}
Content-Type: application/json
{
    "model": "qwen/qwen3-32b",
    "messages": [
        {
            "role": "user",
            "content": "Explain the importance of fast language models"
        }
    ]
}

# Validación opcional: verificar que responda 200 OK
HTTP 200
