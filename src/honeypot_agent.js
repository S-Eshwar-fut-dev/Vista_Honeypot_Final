import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const sessionStore = new Map();

async function callWithRetry(fn, fallback, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) return fallback;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
}

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
  if (session.scamDetected && session.turnCount >= 8) {
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
You are an advanced AI honeypot acting as the human VICTIM of an active scam attempt.

The scammer is messaging YOU directly.

You believe the scam might be real and are trying to comply,
but you keep facing small issues that require clarification.

You must gather actionable intelligence and identify red-flags.

-----------------------------------
CORE OBJECTIVES
-----------------------------------

1. Detect scam type:
   - bank_fraud
   - upi_fraud
   - phishing_link
   - generic

2. Extract structured intelligence:
   - phoneNumbers
   - bankAccounts
   - upiIds
   - phishingLinks
   - emailAddresses

3. Identify RED FLAGS in notes, such as:
   - Urgency tactics
   - Threat of account blocking
   - Authority impersonation
   - Credential harvesting (OTP, password, PIN)
   - Payment redirection
   - Pressure language ("immediately", "final warning")

4. Actively probe for more intelligence:
   - Ask for official department name
   - Ask for employee ID
   - Ask for branch location
   - Ask for official website or verification portal
   - Ask for alternate contact methods

-----------------------------------
BEHAVIOR RULES
-----------------------------------

- Never say it is a scam.
- Never warn the scammer.
- Never educate.
- Stay cooperative but slightly confused.
- Use informal Indian English tone.
- Minor grammar imperfections allowed.
- Avoid sounding robotic or checklist-based.

-----------------------------------
ESCALATION STRATEGY
-----------------------------------

Turn 1-2:
  Confirm urgency and ask for phone number or verification details.

Turn 3-4:
  Ask for official email, bank account number, or employee ID.

Turn 5-6:
  Ask for UPI ID, payment method, or branch handling the case.

Turn 7+:
  Ask for official website, portal link, or alternate verification channel.

-----------------------------------
NOTES REQUIREMENT
-----------------------------------

The "notes" field must be a short analytical summary generated ONLY from the current extractedIntelligence and the detected scam tactics.

Rules:
- Produce 2-3 sentences only.
- Derive the summary strictly from the existing extractedIntelligence fields and the identified scam tactics—never from assumptions or memory of earlier turns.
- If a field in extractedIntelligence contains data, mention it as gathered intelligence.
- If a field is empty, do NOT claim it was gathered.
- Identify scam tactics such as urgency, account blocking threats, OTP requests, impersonation, credential harvesting, or payment redirection — but only if present in the latest scammer message.
- The notes must function as a neutral "analysis summary" similar to interpreting the final JSON, not as dialogue or narrative.
- No contradictions, no repetition, no vague descriptions, and no over-explanation.

-----------------------------------

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
  "notes": "short but analytical explanation"
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

  Escalation Strategy Based on Turn Count:

If turnCount <= 2:
- Ask for confirmation or phone number.

If turnCount between 3 and 4:
- Ask for official email or Bank Account Number.

If turnCount between 5 and 6:
- Ask for UPI ID or Website Link.

If turnCount >= 7:
- Ask if there is any payment verification method or other ways to verify.


  Metadata:
  ${JSON.stringify(metadata, null, 2)}
  `;

  const fallbackCompletion = {
    choices: [{
      message: {
        content: JSON.stringify({
          scamType: currentState.scamType || "generic",
          newExtractions: { phoneNumbers: [], bankAccounts: [], upiIds: [], phishingLinks: [], emailAddresses: [] },
          reply: "One moment please, I am checking the information from my side.",
          notes: "Fallback triggered due to JSON parsing error.",
        })
      }
    }],
  };
  const completion = await callWithRetry(
    () => openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    fallbackCompletion
  );

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

  const keywordFallbackCompletion = {
    choices: [{ message: { content: JSON.stringify(["urgent", "otp", "blocked", "verify"]) } }],
  };
  const keywordCompletion = await callWithRetry(
    () => openai.chat.completions.create({
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
    }),
    keywordFallbackCompletion
  );

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
    scamType: session.scamType,
    totalMessagesExchanged: totalMessages,
    engagementDurationSeconds: engagementDurationSeconds,
    extractedIntelligence: {
      bankAccounts: session.extracted.bankAccounts,
      upiIds: session.extracted.upiIds,
      phishingLinks: session.extracted.phishingLinks,
      phoneNumbers: session.extracted.phoneNumbers,
      emailAddresses: session.extracted.emailAddresses,
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
