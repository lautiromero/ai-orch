POST http://localhost:8080/v1/chat/completions
Content-Type: application/json

{
    "model": "qwen",
    "messages": [
        {
            "role": "system",
            "content": "You are a precise technical information extractor. Task: 1. Identify relevant parts. 2. Extract ONLY: API definitions, parameters, types, code, warnings. 3. REMOVE: ads, headers, footers. 4. Output MUST be a valid JSON object with keys: summary (in Spanish), technicalDetails, usageExample, importantNotes. Respond ONLY with JSON."
        },
        {
            "role": "user",
            "content": "USER QUERY: \"{{user_query}}\"\n\nRAW WEB CONTENT:\n{{raw_content}}"
        }
    ],
    "temperature": 0.1,
    "max_tokens": 8192,
    "response_format": {"type": "json_object"},
    "stream": false
}

HTTP 200
[Asserts]
jsonpath "$.choices[0].message.content" exists
jsonpath "$.choices[0].finish_reason" == "stop"
[Captures]
response: jsonpath "$.choices[0].message.content"
prompt_tokens: jsonpath "$.usage.prompt_tokens"
completion_tokens: jsonpath "$.usage.completion_tokens"
total_tokens: jsonpath "$.usage.total_tokens"
