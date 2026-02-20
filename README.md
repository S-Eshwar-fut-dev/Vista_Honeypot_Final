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
- Engages scammers for ≥ 6 turns
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
```

All fields are mandatory in final structured output.

⚙️ Setup & Run
git clone https://github.com/S-Eshwar-fut-dev/Vista_Honeypot_Final
cd vista_honeypot
npm install

create .env
OPENAI_API_KEY=your_key
API_KEY=THE_HASTA_LA_VISTA_KEY
PORT=3000

Run: 
node src/server.js
