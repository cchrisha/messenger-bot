import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "abednego26";
const PAGE_ACCESS_TOKEN = "EAAddxc7RK0EBP3gh29JgZBK7QkCLiMsZA2QCHkQvwAVZAuQ8qnHQf2IctVy0D8NyH51kfms0quFM2aSjBYhsA8EcvccTRnBGe4Lk204TRRKbqyIA0GbAvJMtDdPGNLb0LSZBvsOKHrLLhA4PzYtMWEJDm0Qu55ctwLMcpr6ZBJMRZCOCoWZAA0oMxaZANdzbP3H190UuH7sptwZDZD";

// webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// webhook events
app.post("/webhook", async (req, res) => {
  console.log("Received event:", JSON.stringify(req.body, null, 2));

  if (req.body.object === "page") {
    for (const entry of req.body.entry) {
      const event = entry.messaging?.[0];
      if (!event) continue;

      const sender_psid = event.sender?.id;
      if (!sender_psid) continue;

      // only trigger to grade10
      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim().toLowerCase();

        if (userMessage === "grade10") {
          await sendIntro(sender_psid);
        } else {
          // ignore other messages
          console.log(`Ignored message: "${userMessage}"`);
        }
      }

      //user clicks a button
      if (event.postback) {
        const payload = event.postback.payload;
        console.log(`Button clicked: ${payload}`);

        if (payload === "YES_LEARN") {
          await sendMessage(sender_psid, "Sige! Halina't mag-aral!");
          await sendQuizQuestion(sender_psid);
        } else if (payload === "NO_LEARN") {
          await sendMessage(sender_psid, "Edi wag!");
        } else if (payload === "ANSWER_CORRECT") {
          await sendMessage(sender_psid, "Mahusay!");
        } else if (payload === "ANSWER_WRONG") {
          await sendMessage(sender_psid, "Hmm. Maari mo pang pag-isipan ang iyong sagot. Subukan mo uli.");
          await sendQuizQuestion(sender_psid);
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

//intro message with buttons
async function sendIntro(psid) {
  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Hello, Kumusta! Ako si Glen, ang iyong ChatBot!\nGusto mo bang matuto?",
          buttons: [
            { type: "postback", title: "Oo", payload: "YES_LEARN" },
            { type: "postback", title: "Hindi", payload: "NO_LEARN" },
          ],
        },
      },
    },
  };
  await callSendAPI(payload);
}

// quiz question with choices
async function sendQuizQuestion(psid) {
  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Sino ang unang taong nakatapak sa Pilipinas?",
          buttons: [
            { type: "postback", title: "A. Eba", payload: "ANSWER_WRONG" },
            { type: "postback", title: "B. Magellan", payload: "ANSWER_CORRECT" },
            { type: "postback", title: "C. Mama", payload: "ANSWER_WRONG" },
          ],
        },
      },
    },
  };
  await callSendAPI(payload);
}

// send text
async function sendMessage(psid, text) {
  const payload = {
    recipient: { id: psid },
    message: { text },
  };
  await callSendAPI(payload);
}

//send to Facebook Graph API
async function callSendAPI(payload) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.error) {
      console.error("Send API error:", data.error);
    } else {
      console.log("Message sent successfully!");
    }
  } catch (err) {
    console.error("Network error:", err);
  }
}

//server
app.listen(3000, () => console.log("Server running on port 3000"));
