import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "abednego26";
const PAGE_ACCESS_TOKEN = "EAAddxc7RK0EBP3gh29JgZBK7QkCLiMsZA2QCHkQvwAVZAuQ8qnHQf2IctVy0D8NyH51kfms0quFM2aSjBYhsA8EcvccTRnBGe4Lk204TRRKbqyIA0GbAvJMtDdPGNLb0LSZBvsOKHrLLhA4PzYtMWEJDm0Qu55ctwLMcpr6ZBJMRZCOCoWZAA0oMxaZANdzbP3H190UuH7sptwZDZD";

//temporary user progress tracker
const userProgress = {};

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

      // user sends a text
      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim().toLowerCase();

        // user in icebreaker mode
        if (userProgress[sender_psid]) {
          await handleUserAnswer(sender_psid, userMessage);
        } else if (userMessage === "grade9") {
          await sendIntro(sender_psid);
        } else {
          console.log(`Ignored message: "${userMessage}"`);
        }
      }

      // handle button clicks (postbacks)
      if (event.postback) {
        const payload = event.postback.payload;

        if (payload === "YES_LEARN") {
          await sendReadyMessage(sender_psid);
        } else if (payload === "YES_ACTIVITY") {
          await sendNextActivity(sender_psid);
        } else if (payload === "SAAN_PO") {
          await sendParabulaLesson(sender_psid);
        } else if (payload === "UNDERSTOOD") {
          await sendMessage(sender_psid, "✅ Okay, sige!");
          await new Promise((r) => setTimeout(r, 1500));

        //   const quizPayload = {
        //     recipient: { id: sender_psid },
        //     message: {
        //       attachment: {
        //         type: "template",
        //         payload: {
        //           template_type: "button",
        //           text: "🤔 Ano nga uli ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?",
        //           buttons: [
        //             {
        //                 type: "postback",
        //                 title: `Nagtuturo ng aral sa moral at espiritwal na aspeto`,
        //                 payload: "CORRECT_PARABULA",
        //             },
        //             {
        //                 type: "postback",
        //                 title: `Nagtuturo ng pahayag na may kaugnay sa kasabihan`,
        //                 payload: "WRONG_PARABULA",
        //             },
        //           ],
        //         },
        //       },
        //     },
        //   };
        //   await callSendAPI(quizPayload);
        // } 
        // else if (payload === "CORRECT_PARABULA") {
        //   await sendMessage(sender_psid, "✅ Tama!");
        //   await new Promise((r) => setTimeout(r, 1500));

        //   const followPayload = {
        //     recipient: { id: sender_psid },
        //     message: {
        //       attachment: {
        //         type: "template",
        //         payload: {
        //           template_type: "button",
        //           text: `May tama ka!`,
        //           buttons: [{ type: "postback", title: "OPO!", payload: "EXPLAIN_AGAIN" }],
        //         },
        //       },
        //     },
        //   };
        //   await callSendAPI(followPayload);
        // } 
        // else if (payload === "WRONG_PARABULA") {
        //   await sendMessage(sender_psid, "❌ Hmm. Sigurado ka ba?");
        //   await new Promise((r) => setTimeout(r, 1500));

        //   const followPayload = {
        //     recipient: { id: sender_psid },
        //     message: {
        //       attachment: {
        //         type: "template",
        //         payload: {
        //           template_type: "button",
        //           text: "🤓 Upang mas maunawaan mo ang ating talakayan, gusto mo bang ipaliwanag ko uli sayo ang ating talakayan?",
        //           buttons: [{ type: "postback", title: "OPO!", payload: "EXPLAIN_AGAIN" }],
        //         },
        //       },
        //     },
        //   };
        //   await callSendAPI(followPayload);
        // } 
        // else if (payload === "EXPLAIN_AGAIN") {
        //   await sendMessage(sender_psid, "✅ Okay, sige!");
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// intro message with button
async function sendIntro(psid) {
  try {
    const userResponse = await fetch(
      `https://graph.facebook.com/${psid}?fields=first_name&access_token=${PAGE_ACCESS_TOKEN}`
    );
    const userData = await userResponse.json();
    const firstName = userData.first_name || "Mag-aaral";

    const introText = `👋 Kumusta, ${firstName}!\n\n🤓 Ako si 𝗦𝗶𝗿 𝗚𝗹𝗲𝗻 𝗢𝗹𝗶𝘃𝗲𝗿 o mas kilala bilang si 𝗦𝗶𝗿 𝗚𝗼, ang iyong Filipino ChatBot. Ngayon ay magsisimula na tayo sa ating bagong aralin para sa ikatlong markahan sa unang sesyon sa Filipino.\n\n🥰 Panibagong talakayan, dagdag kaalaman!`;

    const learnText = `🤓 Handa ka na bang matuto?`;

    // send intro then separate learn question
    await sendMessage(psid, introText);
    await new Promise((r) => setTimeout(r, 1000));

    const payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: learnText,
            buttons: [{ type: "postback", title: "OPO!", payload: "YES_LEARN" }],
          },
        },
      },
    };

    await callSendAPI(payload);
  } catch (error) {
    console.error("Error fetching user info or sending intro:", error);
  }
}

// after clicking first OPO
async function sendReadyMessage(psid) {
  try {
    const userResponse = await fetch(
      `https://graph.facebook.com/${psid}?fields=first_name&access_token=${PAGE_ACCESS_TOKEN}`
    );
    const userData = await userResponse.json();
    const firstName = userData.first_name || "Mag-aaral";

    const text1 = `😄 Ayan! Handa na nga si Bb./G. ${firstName}!`;
    const text2 = `😄 Ngayon, bago tayo magsimula sa ating pormal na talakayan ay magkakaroon muna tayong paunang gawain.\n\n🤓 Tinatawag ko itong "𝗣𝗨𝗡𝗔𝗡 𝗔𝗧 𝗛𝗨𝗟𝗔𝗔𝗡", na kung saan kinakailangan mong mahulaan ang mga larawan na iyong makikita at may mga patlang na iyong pupunan upang makabuo ng isang salita.`;

    await sendMessage(psid, text1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, text2);
    await new Promise((r) => setTimeout(r, 1000));
    await sendHandaKaNaBa(psid);
  } catch (err) {
    console.error("Error in sendReadyMessage:", err);
  }
}

// handa ka na ba ulit
async function sendHandaKaNaBa(psid) {
  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "🤓 Handa ka na ba?",
          buttons: [{ type: "postback", title: "OPO!", payload: "YES_ACTIVITY" }],
        },
      },
    },
  };
  await callSendAPI(payload);
}

// start the icebreaker
async function sendNextActivity(psid) {
  await sendMessage(psid, "😄 Ayan! Magsimula na tayo!");
  userProgress[psid] = 1; // start question 1
  await new Promise((r) => setTimeout(r, 1000));
  await sendQuestion(psid, 1);
}

// send question
async function sendQuestion(psid, number) {
  let question = "";

  if (number === 1) {
    await sendImage(psid, "https://i.imgur.com/rvx4L1e.jpg");
    question = "Sa unang larawan, ano ang iyong napansin at ano ang iyong sagot?\n\nB \u200B_ \u200BB \u200BL \u200B_ \u200B_ \u200BA";
  } else if (number === 2) {
    await sendMessage(psid, "Sumunod?");
    await new Promise((r) => setTimeout(r, 1000));
    await sendImage(psid, "https://i.imgur.com/gkt7Kr9.jpg");
    question = "G \u200B_ \u200BS \u200BT \u200B_ \u200B_ \u200BO \u200B_";
  } else if (number === 3) {
    await sendImage(psid, "https://i.imgur.com/gUk0MqT.jpg");
    question = "Ikatlong larawan.\n\n\u200B_ \u200BA \u200B_ \u200BA \u200BS \u200BL \u200BA \u200B_ \u200B_ \u200BN";
  } else {
    await sendMessage(psid, `🥰 Ayan! Maraming salamat, Bb./G. sa pagsagot.`);
    await new Promise((r) => setTimeout(r, 1500));

    // start parabula
    const questionPayload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "Kung makikita, ang ating magiging talakayan ay patungkol sa??",
            buttons: [{ type: "postback", title: "SAAN PO?", payload: "SAAN_PO" }],
          },
        },
      },
    };

    await callSendAPI(questionPayload);
    delete userProgress[psid];
    return;
  }

  await sendMessage(psid, question);
}

// parabula lesson
async function sendParabulaLesson(psid) {

    const parabula1 = "🤓 Ang ating magiging talakayan ay patungkol sa 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮!";
    const parabula2 = "🧐 𝗦𝗶𝗿 𝗚𝗼, ano po ba ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?";
    const parabula3 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆. Karaniwang ito ay batay sa mga aral ni Hesus mula sa Bibliya, ngunit maaari rin itong gamitin sa mas malawak na konteksto bilang kuwentong may 𝘁𝗮𝗹𝗶𝗻𝗵𝗮𝗴𝗮 𝗼 𝘀𝗶𝗺𝗯𝗼𝗹𝗶𝘀𝗺𝗼 na nagtuturo ng mabuting asal.`
    const parabula4 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay 𝗽𝗮𝗴𝘁𝘂𝘁𝘂𝗹𝗮𝗱 𝗼 𝗽𝗮𝗴𝗵𝗮𝗵𝗮𝗺𝗯𝗶𝗻𝗴. Ibig sabihin, sa parabula ay may isang kuwento na ginagawang halimbawa upang ipaliwanag ang mas malalim na katotohanan.`
    const parabula5 = `📖 Karaniwan, ang mga tauhan ay tao at ang mga pangyayari ay may malalim na kahulugang espiritwal.`

    await sendMessage(psid, parabula1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, parabula2);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, parabula3);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, parabula4);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, parabula5);
    await new Promise((r) => setTimeout(r, 1000));

  const understoodPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "😌 Nauunawaan ba, Bb./G.?",
          buttons: [{ type: "postback", title: "OPO!", payload: "UNDERSTOOD" }],
        },
      },
    },
  };

  await callSendAPI(understoodPayload);
}

// handle answers icebreaker
async function handleUserAnswer(psid, userMessage) {
  if (!userProgress[psid]) return; // not icebreaker mode

  const current = userProgress[psid];
  const answer = userMessage.trim().toLowerCase();

  if (current === 1 && answer === "bibliya") {
    await sendMessage(psid, "✅ Tumpak! Ang tamang sagot ay 𝗕𝗜𝗕𝗟𝗜𝗬𝗔.");
    userProgress[psid] = 2;
    await new Promise((r) => setTimeout(r, 1000));
    await sendQuestion(psid, 2);
  } else if (current === 2 && answer === "gastador") {
    await sendMessage(psid, "✅ Tumpak! Ang tamang sagot ay 𝗚𝗔𝗦𝗧𝗔𝗗𝗢𝗥.");
    userProgress[psid] = 3;
    await new Promise((r) => setTimeout(r, 1000));
    await sendQuestion(psid, 3);
  } else if (current === 3 && answer === "makasalanan") {
    await sendMessage(psid, "✅ Tumpak! Ang tamang sagot ay 𝗠𝗔𝗞𝗔𝗦𝗔𝗟𝗔𝗡𝗔𝗡.");
    userProgress[psid] = 4;
    await new Promise((r) => setTimeout(r, 1000));
    await sendQuestion(psid, 4);
  }
}

// reusable text sender
async function sendMessage(psid, text) {
  const payload = {
    recipient: { id: psid },
    message: { text },
  };
  await callSendAPI(payload);
}

// reusable image sender
async function sendImage(psid, imageUrl) {
  const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "image",
        payload: { url: imageUrl, is_reusable: true },
      },
    },
  };
  await callSendAPI(payload);
}

// send to Facebook Graph API
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

// start server
app.listen(3000, () => console.log("Server running on port 3000"));
