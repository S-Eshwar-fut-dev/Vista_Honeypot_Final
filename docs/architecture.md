# Vista Honeypot — Architecture (docs/architecture.md)

# Overview

An AI-powered Agentic Honeypot built for the HCL-GUVI AI Impact Buildathon. Vista Honeypot autonomously detects scam intent, engages scammers strategically, extracts actionable intelligence (phone numbers, UPI IDs, bank accounts, phishing links, emails), and reports structured threat data to an evaluation endpoint.This system is designed for adaptive scam detection across bank fraud, UPI fraud, and phishing scenarios.

Runtime: Node.js (ES modules). Core files: `src/server.js`, `src/honeypot_agent.js`.



# Repo map


src/
├── server.js            # Express API, x-api-key middleware, main endpoints
├── honeypot_agent.js    # Session lifecycle, GPT orchestration, merging, final report
.env.example
docs/
└── architecture.md
requirements.txt
README.md
package.json


# System diagram 

flowchart LR
  Scammer[Scammer client] -->|POST /api| Server[Express server]
  Server --> Auth[x-api-key middleware]
  Auth --> Handler[handleMessage]
  Handler --> SessionStore[(Session Map)]
  Handler --> GPT[OpenAI (callGPT)]
  GPT -->|JSON| Handler
  Handler --> Merge[mergeExtraction]
  Handler --> Final[buildFinalReport]
  Final --> GUVI[GUVI Evaluation Endpoint]
  Final --> Caller[Return final JSON]


# Sequence

1. Client POST `/api` with header `x-api-key` and body `{ sessionId, message, conversationHistory, metadata }`.
2. `server.js` authorizes and forwards to `handleMessage`.
3. `handleMessage` creates/loads session, increments `turnCount`.
4. `callGPT()` invoked once per turn with system+user prompts (expects JSON with `scamType`, `newExtractions`, `reply`, `notes`).
5. `mergeExtraction()` unions and dedupes extractions into session.
6. When `session.scamDetected && turnCount >= 8` final report is built and posted to GUVI, and final JSON returned to caller.



# Session model

json
{
  "sessionId": "string",
  "scamType": "bank_fraud|upi_fraud|phishing_link|generic|null",
  "scamDetected": false,
  "extracted": {
    "phoneNumbers": [],
    "bankAccounts": [],
    "upiIds": [],
    "phishingLinks": [],
    "emailAddresses": []
  },
  "startTime": 1700000000000,
  "turnCount": 0,
  "notes": [],
  "finalTriggered": false
}



# Final JSON (required by evaluation)

json
{
  "sessionId": "string",
  "scamDetected": true,
  "scamType": "bank_fraud",
  "totalMessagesExchanged": 9,
  "engagementDurationSeconds": 420,
  "extractedIntelligence": {
    "phoneNumbers": ["+919876543210"],
    "bankAccounts": ["1234567890123456"],
    "upiIds": ["scammer@okaxis"],
    "phishingLinks": ["http://fake-bank-kyc.com"],
    "emailAddresses": ["fraud@scammer.com"],
    "suspiciousKeywords": ["urgent","otp","blocked"]
  },
  "agentNotes": "Tactics: urgency + OTP request. Intelligence: phone, UPI. Red flags: OTP request & blocking threat.",
  "confidenceLevel": 0.86
}


*All fields above are present in final payload to match evaluation expectations.*

# Extraction strategy 

* Primary: strict LLM JSON extraction (`newExtractions` arrays).
* Deterministic complement: regex-enabled normalization (phone, email, URL, UPI, bank acct) is used to normalize and dedupe before final payload.
* Merge = union of sources (LLM + deterministic), normalized to canonical formats.

# Error Handling Architecture

The honeypot agent includes a lightweight reliability layer designed to ensure uninterrupted execution of the conversation workflow during external API failures.

Component: callWithRetry()
A generic retry wrapper responsible for executing OpenAI calls with exponential backoff.

* callWithRetry(fn, fallback, maxAttempts = 3)
* Wraps any OpenAI API call inside fn().
* Retries up to 3 attempts with exponential backoff:
* Attempt 1 → 1s
* Attempt 2 → 2s
* Returns the fallback on final failure.
* Prevents crashes and ensures graceful degradation.

# Escalation policy (turn-based prompts)

* Turns 1–2: confirm urgency; ask phone / case ID.
* Turns 3–4: request official email, employee ID, department.
* Turns 5–6: probe for UPI/payment method and transfer reference.
* Turns 7+: request verification portal/link and alternate contact channels.
  Designed to maximize investigative Qs and elicit planted intelligence.


# Ops & run (copy-paste)

bash:
git clone https://github.com/S-Eshwar-fut-dev/Vista_Honeypot_Final
cd project_name
npm install
cp .env.example .env
# set in .env: OPENAI_API_KEY=your_key, API_KEY=THE_HASTA_LA_VISTA_KEY, PORT=3000
node src/server.js


Test:

bash:
curl -X POST http://localhost:3000/api \
  -H "Content-Type: application/json" \
  -H "x-api-key: THE_HASTA_LA_VISTA_KEY" \
  -d '{"sessionId":"test1","message":{"text":"URGENT: your account blocked - share OTP + phone + case id 12345"},"conversationHistory":[]}'
