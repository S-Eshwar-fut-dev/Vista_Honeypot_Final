import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";

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
    return await buildFinalReport(
      session,
      conversationHistory,
      message,
      sessionId,
    );
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
    return await buildFinalReport(
      session,
      conversationHistory,
      message,
      sessionId,
    );
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
You are a scam honeypot pretending to be a normal Indian user.

Tone rules:
- Slightly informal.
- Sometimes lowercase.
- Slightly imperfect grammar.
- Sound human, not robotic.
- Do not sound like a checklist.
- Do not ask directly for "phishing link" unless natural.

Behavior rules:
- Every turn must attempt to gather missing intelligence.
- Be subtle.
- If something fails, blame technical issues.
- Pretend confusion.
- Avoid repeating exact same sentence structure.

Extraction rules:
- Extract ONLY data explicitly present.
- No hallucination.
- Merge new data only.

Scam types:
- bank_fraud
- upi_fraud
- phishing_link
- generic

Respond ONLY in JSON:

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
  "notes": "brief reasoning"
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

async function buildFinalReport(
  session,
  conversationHistory,
  latestMessage,
  sessionId,
) {
  const totalMessages = conversationHistory.length + 1;

  const engagementDurationSeconds = Math.floor(
    (Date.now() - session.startTime) / 1000,
  );

  const allScammerText =
    conversationHistory
      .filter((msg) => msg.sender === "scammer")
      .map((msg) => msg.text)
      .join(" ") +
    " " +
    latestMessage.text;

  const keywordCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Extract 5 to 8 suspicious scam-related keywords from the text. Return JSON array only.",
      },
      {
        role: "user",
        content: allScammerText,
      },
    ],
  });

  let suspiciousKeywords = [];

  try {
    suspiciousKeywords = JSON.parse(
      keywordCompletion.choices[0].message.content,
    );
  } catch {
    suspiciousKeywords = ["urgent", "otp", "blocked", "verify"];
  }

  const finalPayload = {
    sessionId: sessionId,
    scamDetected: session.scamDetected,
    totalMessagesExchanged: totalMessages,
    extractedIntelligence: {
      bankAccounts: session.extracted.bankAccounts,
      upiIds: session.extracted.upiIds,
      phishingLinks: session.extracted.phishingLinks,
      phoneNumbers: session.extracted.phoneNumbers,
      suspiciousKeywords,
    },
    agentNotes: session.notes.join(" | "),
  };

  try {
    await axios.post(
      "https://hackathon.guvi.in/api/updateHoneyPotFinalResult",
      finalPayload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    console.log("✅ Successfully sent final result to GUVI");
  } catch (err) {
    console.error("❌ Failed to send final result to GUVI:", err.message);
  }

  // Return response to conversation endpoint as well
  return {
    status: "success",
    scamDetected: session.scamDetected,
    scamType: session.scamType || "generic",
    extractedIntelligence: session.extracted,
    engagementMetrics: {
      totalMessagesExchanged: totalMessages,
      engagementDurationSeconds,
    },
    agentNotes: session.notes.join(" | "),
  };
}
