![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

# Vista Honeypot – Agentic Scam Intelligence Extractor

An AI-powered Agentic Honeypot built for the HCL-GUVI AI Impact Buildathon.

Vista Honeypot autonomously detects scam intent, engages scammers strategically, extracts actionable intelligence (phone numbers, UPI IDs, bank accounts, phishing links, emails), and reports structured threat data to an evaluation endpoint.

This system is designed for adaptive scam detection across bank fraud, UPI fraud, and phishing scenarios.

---

## 🎯 Objective

To build a conversational AI honeypot that:

- Detects scam intent automatically
- Engages scammers for ≥ 8 turns
- Extracts structured intelligence
- Identifies red-flag patterns
- Sends final intelligence to a secure evaluation endpoint
- Maintains structured API compliance

---

## 🧠 Architecture Overview

src/
├── server.js → Express server & API key middleware
├── honeypot_agent.js → Core intelligence engine

### Core Components

| Module           | Responsibility                                |
| ---------------- | --------------------------------------------- |
| Session Store    | In-memory Map for session tracking            |
| GPT Engine       | Adaptive classification + extraction          |
| Escalation Logic | Turn-based intelligence probing               |
| Callback Handler | Sends final JSON to GUVI endpoint             |
| Error Handling   | Safe fallback for JSON parsing & API failures |

---

## 🔍 Scam Handling Strategy

The honeypot uses:

- Role-locked victim simulation
- Turn-based escalation strategy
- Red-flag keyword identification
- Controlled intelligence extraction
- Adaptive response generation
- Strict JSON enforcement


### Escalation Phases

| Turns | Strategy                                     |
| ----- | -------------------------------------------- |
| 1–2   | Confirm urgency + request phone verification |
| 3–4   | Ask for official email / alternate contact   |
| 5–6   | Probe for UPI / payment method               |
| 7+    | Ask for verification link / site             |

---
## 🔐 Reliability & Error Handling

The honeypot agent includes a fault-tolerant error-handling layer to ensure stable behavior even under API instability or network fluctuations.

Key mechanisms implemented:

Exponential Backoff for OpenAI API Calls

All outbound OpenAI calls are wrapped in a retry helper that attempts the request up to three times:

- Attempt 1 → 1 second delay
- Attempt 2 → 2 seconds delay
- Attempt 3 → fallback response returned
- This prevents transient API failures from breaking the conversation flow.

Guaranteed Fallback JSON

If all retries fail, the system returns a deterministic fallback JSON response, ensuring:

- valid schema
- no conversation interruption
- predictable downstream behavior
- compliance with GUVI’s evaluation contract

Safe Keyword Extraction

Final keyword extraction also uses the same retry mechanism and falls back to a stable keyword set:["urgent", "otp", "blocked", "verify"]

This ensures the final intelligence report is complete even during partial failures.

## ⚙️ Setup & Run

git clone https://github.com/S-Eshwar-fut-dev/Vista_Honeypot_Final
cd project_name
npm install/npm i

create .env
OPENAI_API_KEY=your_key
API_KEY=THE_HASTA_LA_VISTA_KEY
PORT=3000

Run: 
node src/server.js

## 📦 Intelligence Extracted

```json
{
  "phoneNumbers": [],
  "bankAccounts": [],
  "upiIds": [],
  "phishingLinks": [],
  "emailAddresses": [],
  "suspiciousKeywords": []
}

All fields are mandatory in final structured output.


