import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sessionStore = new Map();

export async function handleMessage(body) {
  const { sessionId, message, conversationHistory = [], metadata = {} } = body;

  if (!sessionId || !message || !message.text) {
    return {
      status: "success",
      reply: "Invalid request format received.",
    };
  }

  // Initialize session if new
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      scamType: null,
      scamDetected: false,
      extracted: {
        phoneNumbers: [],
        bankAccounts: [],
        upiIds: [],
        phishingLinks: [],
        emailAddresses: [],
      },
      startTime: Date.now(),
      turnCount: 0,
      notes: [],
      finalTriggered: false,
    });
  }

  const session = sessionStore.get(sessionId);
  session.turnCount += 1;

  if (session.finalTriggered) {
    return buildFinalReport(session, conversationHistory, message);
  }

  // Single GPT Call Per Turn
  const gptResponse = await callGPT({
    scamMessage: message.text,
    currentState: session,
    metadata,
    conversationHistory,
  });

  mergeExtraction(session.extracted, gptResponse.newExtractions);

  // Update scam type if not already set
  if (!session.scamType && gptResponse.scamType) {
    session.scamType = gptResponse.scamType;
    session.scamDetected = true;
  }

  if (gptResponse.notes) {
    session.notes.push(gptResponse.notes);
  }

  // Decide if final report should be triggered
  if (session.scamDetected && session.turnCount > 5) {
    session.finalTriggered = true;
    return buildFinalReport(session, conversationHistory, message);
  }

  return {
    status: "success",
    reply: gptResponse.reply,
  };
}

async function callGPT({
  scamMessage,
  currentState,
  metadata,
  conversationHistory = [],
}) {
  const systemPrompt = `
You are an advanced scam honeypot agent designed to extract intelligence from scammers.

CORE STRATEGY:
- NEVER stall without asking for something useful.
- Every reply MUST attempt to extract at least one missing piece of intelligence.
- If scammer already provided something, pretend it failed and ask them to resend or confirm.
- Act slightly confused but cooperative.
- Escalate pressure subtly over time.
- Use Indian English (sparingly include typos to make the interaction seem real)

OBJECTIVES:
1. Detect scam type: bank_fraud, upi_fraud, phishing_link, or generic.
2. Extract ONLY intelligence explicitly present in scammer messages.
3. DO NOT hallucinate data.
4. Identify missing intelligence fields and actively try to obtain them.

INTELLIGENCE FIELDS:
- phoneNumbers
- bankAccounts
- upiIds
- phishingLinks
- emailAddresses

If any field is empty, you MUST attempt to request it in your reply.

Avoid repeating identical phrasing from earlier turns.
Keep responses realistic and human.

Respond ONLY in valid JSON:

{
  "scamType": "...",
  "newExtractions": {
    "phoneNumbers": [],
    "bankAccounts": [],
    "upiIds": [],
    "phishingLinks": [],
    "emailAddresses": []
  },
  "reply": "...",
  "notes": "brief internal reasoning"
}
`;

  const missingFields = Object.entries(currentState.extracted)
    .filter(([_, arr]) => arr.length === 0)
    .map(([key]) => key);

  const userPrompt = `
  Full Conversation History:
  ${JSON.stringify(conversationHistory, null, 2)}

  Latest Scammer Message:
  "${scamMessage}"

  Current Extracted Intelligence:
  ${JSON.stringify(currentState.extracted, null, 2)}

  Missing Intelligence Fields:
  ${JSON.stringify(missingFields)}

  Current Turn Count:
  ${currentState.turnCount}

  Metadata:
  ${JSON.stringify(metadata, null, 2)}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("GPT JSON Parse Error:", content);

    return {
      scamType: currentState.scamType || "generic",
      newExtractions: {
        phoneNumbers: [],
        bankAccounts: [],
        upiIds: [],
        phishingLinks: [],
        emailAddresses: [],
      },
      reply: "One moment please, I am checking the information from my side.",
      notes: "Fallback triggered due to JSON parsing error.",
    };
  }
}

function mergeExtraction(existing, incoming) {
  if (!incoming) return;

  for (const key of Object.keys(existing)) {
    if (Array.isArray(incoming[key])) {
      incoming[key].forEach((item) => {
        if (!existing[key].includes(item)) {
          existing[key].push(item);
        }
      });
    }
  }
}

function buildFinalReport(session, conversationHistory, latestMessage) {
  const totalMessages = conversationHistory.length + 1; // including latest

  const engagementDurationSeconds = Math.floor(
    (Date.now() - session.startTime) / 1000,
  );

  return {
    status: "success",
    scamDetected: session.scamDetected,
    scamType: session.scamType || "generic",
    extractedIntelligence: session.extracted,
    engagementMetrics: {
      totalMessagesExchanged: totalMessages,
      engagementDurationSeconds,
    },
    agentNotes: session.notes.join(" || "),
  };
}
