import e from "express";
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "abednego26";
const PAGE_ACCESS_TOKEN = "EAAddxc7RK0EBP3gh29JgZBK7QkCLiMsZA2QCHkQvwAVZAuQ8qnHQf2IctVy0D8NyH51kfms0quFM2aSjBYhsA8EcvccTRnBGe4Lk204TRRKbqyIA0GbAvJMtDdPGNLb0LSZBvsOKHrLLhA4PzYtMWEJDm0Qu55ctwLMcpr6ZBJMRZCOCoWZAA0oMxaZANdzbP3H190UuH7sptwZDZD";

//temporary user progress tracker
const userProgress = {};

//---------------------------------------------------------------------//
//-------------------FUNCTIONS----------------------------------------//
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

      if (event.message && event.message.text && userProgress[sender_psid] === "WAITING_OPINIONATED_ANSWER") {
        await handleOpinionatedAnswer(sender_psid);
        delete userProgress[sender_psid]; // clear progress after answering
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
        } else if (payload === "UNDERSTOOD_PARABULA") {
          await sendNaunawaan(sender_psid);
        } else if (payload === "UNDERSTOOD2_PARABULA") {
            await sendNextNaunawaan(sender_psid);
        } else if (payload === "NOTUNDERSTOOD2_PARABULA") {
            await sendNotNaunawaan(sender_psid);
        } 
        // else if (payload === "OPO_READ") {
        //     await sendParabulaPagbasa(sender_psid);
        // } else if (payload === "NABASA_NA") {
        //     await sendNabasaNa(sender_psid);
        // }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});
//---------------------------------------------------------------------//


//--------------------starting the lesson-----------------------//
// intro message with button
async function sendIntro(psid) {

    const intro1 = `𝗙𝟵𝗣𝗧-𝗜𝗜𝗜𝗮-𝟱𝟬`;
    const intro2 = `Nabibigyang-kahulugan ang matatalinghagang pahayag sa parabula`;
    const introText = `👋 Kumusta!\n\n🤓 Ako si 𝗦𝗶𝗿 𝗚𝗹𝗲𝗻 𝗢𝗹𝗶𝘃𝗲𝗿 o mas kilala bilang si 𝗦𝗶𝗿 𝗚𝗼, ang iyong Filipino ChatBot. Ngayon ay magsisimula na tayo sa ating bagong aralin para sa ikatlong markahan sa unang sesyon sa Filipino.\n\n🥰 Panibagong talakayan, dagdag kaalaman!`;
    const learnText = `🤓 Handa ka na bang matuto?`;

    await sendMessage(psid, intro1);
    await sendMessage(psid, intro2);
    await new Promise((r) => setTimeout(r, 1000));
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
}


// INTRODUCTION ng ice breaker
async function sendReadyMessage(psid) {

    const text1 = `😄 Ayan! Handa na nga siya!`;
    const text2 = `😄 Ngayon, bago tayo magsimula sa ating pormal na talakayan ay magkakaroon muna tayong paunang gawain.`;
    const text3 = `🤓 Tinatawag ko itong “𝗣𝗨𝗡𝗔𝗡 𝗔𝗧 𝗛𝗨𝗟𝗔𝗔𝗡”, na kung saan kinakailangan mong mahulaan ang mga larawan na iyong makikita at may mga patlang na iyong pupunan upang makabuo ng isang salita.`;

    await sendMessage(psid, text1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, text2);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, text3);
    await new Promise((r) => setTimeout(r, 1000));

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
    await sendMessage(psid, "Sa unang larawan, ano ang iyong napansin at ano ang iyong sagot");
    await sendImage(psid, "https://i.imgur.com/rvx4L1e.jpg");
    question = "\n\nB \u200B_ \u200BB \u200BL \u200B_ \u200B_ \u200BA";
  } else if (number === 2) {
    await sendMessage(psid, "Sumunod?");
    await new Promise((r) => setTimeout(r, 1000));
    await sendImage(psid, "https://i.imgur.com/gkt7Kr9.jpg");
    question = "G \u200B_ \u200BS \u200BT \u200B_ \u200B_ \u200BO \u200B_";
  } else if (number === 3) {
    await sendMessage(psid, "Ikatlong larawan.");
    await sendImage(psid, "https://i.imgur.com/gUk0MqT.jpg");
    question = "\n\n\u200B_ \u200BA \u200B_ \u200BA \u200BS \u200B_ \u200BL \u200BA \u200B_ \u200B_ \u200BN";
  } else {
    await sendMessage(psid, `🥰 Ayan! Maraming salamat sa pagsagot!`);
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
            buttons: [{ type: "postback", title: "PATUNGKOL PO SAAN?", payload: "SAAN_PO" }],
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
//end of icebreaker

// parabula lesson
async function sendParabulaLesson(psid) {

    const parabula1 = "🤓 Ang ating magiging talakayan ay patungkol sa 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮!";
    const parabula2 = "🧐 𝗦𝗶𝗿 𝗚𝗼, ano po ba ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?";
    const parabula3 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆. Karaniwang ito ay batay sa mga aral ni Hesus mula sa Bibliya, ngunit maaari rin itong gamitin sa mas malawak na konteksto bilang kuwentong may 𝘁𝗮𝗹𝗶𝗻𝗵𝗮𝗴𝗮 𝗼 𝘀𝗶𝗺𝗯𝗼𝗹𝗶𝘀𝗺𝗼 na nagtuturo ng mabuting asal.`;
    const parabula4 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay 𝗽𝗮𝗴𝘁𝘂𝘁𝘂𝗹𝗮𝗱 𝗼 𝗽𝗮𝗴𝗵𝗮𝗵𝗮𝗺𝗯𝗶𝗻𝗴. Ibig sabihin, sa parabula ay may isang kuwento na ginagawang halimbawa upang ipaliwanag ang mas malalim na katotohanan.`;
    const parabula5 = `📖 Karaniwan, ang mga tauhan ay tao at ang mga pangyayari ay may malalim na kahulugang espiritwal.`;

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
          text: "😌 Nauunawaan ba?",
          buttons: [{ type: "postback", title: "OPO!", payload: "UNDERSTOOD_PARABULA" }],
        },
      },
    },
  };

  await callSendAPI(understoodPayload);
}

//nauunawaan with opinionated answer
async function sendNaunawaan(psid) {
    
    const nauunawaan1 = `✅ Okay, sige!`;
    const nauunawaan2 = `🤔 Kung talagang nauunawaan mo. Ano nga uli ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?\n\n(Ipahayag ang sagot.)`;

    await sendMessage(psid, nauunawaan1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, nauunawaan2);
    await new Promise((r) => setTimeout(r, 1000));

    userProgress[psid] = "WAITING_OPINIONATED_ANSWER";
}

// handle opinionated response
async function handleOpinionatedAnswer(psid) {
    await sendMessage(psid, "✅ Ayan! Mahusay!");
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, "📖 Sa madaling sabi, ito ay kuwentong may aral na nagtuturo ng mabuting asal at pananampalataya.");
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, "📖 Dagdag pa na ang parabula ay isinusulat upang magturo, hindi lang para maglibang at magbigay aliw.");

    const understood2Payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "🤓 Nauunawaan ba?",
          buttons: [
            { type: "postback", title: "OPO!", payload: "UNDERSTOOD2_PARABULA" },
            { type: "postback", title: "HINDI PO.", payload: "NOTUNDERSTOOD2_PARABULA" }
          ],
        },
      },
    },
  };

  await callSendAPI(understood2Payload);
}

//hindi nauunawaan
async function sendNotNaunawaan(psid) {

    const notnicemsg = `😌 Okay, sige! Balikan natin`;
    const explain1 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆.`;
    const explain2 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay pagtutulad o paghahambing.`;

    await sendMessage(psid, notnicemsg);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, explain1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, explain2);
    await new Promise((r) => setTimeout(r, 1000));

    const understood2Payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "🤓 Nauunawaan na ba?",
          buttons: [
            { type: "postback", title: "OPO!", payload: "UNDERSTOOD2_PARABULA" },
            { type: "postback", title: "HINDI PO.", payload: "NOTUNDERSTOOD2_PARABULA" }
          ],
        },
      },
    },
  };

  await callSendAPI(understood2Payload);
}

//kung nauunawaan
async function sendNextNaunawaan(psid) {
    const nicemsg = `🤓 Tunay ngang nauunawaan!`;
    const pagbasa = `📖 Ngayon ay magbabasa tayo at unaawain natin ang isang parabulang pinamagatang "𝗔𝗻𝗴 𝗔𝗹𝗶𝗯𝘂𝗴𝗵𝗮𝗻𝗴 𝗔𝗻𝗮𝗸" na matatagpuan sa sangunian ng bibliya sa ebanghelyo ni San Lucas sa kabanata 15, talata 11 hanggang 32 (Luke 15:11–32). `;

    await sendMessage(psid, nicemsg);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, pagbasa);
    await new Promise((r) => setTimeout(r, 1000));

    const pagbasaPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "🤔 Handa na bang magbasa?",
          buttons: [
            { type: "postback", title: "OPO!", payload: "OPO_READ" },
          ],
        },
      },
    },
  };

  await callSendAPI(pagbasaPayload);
}

// async function sendParabulaPagbasa(psid) {

//     const pagbasa1 = `May isang ama na may dalawang anak. Isang araw, hiningi ng bunsong anak ang kanyang mamanahin at lumayo sa kandungan ng ama upang makipagsapalaran sa malayong lupain. Doon ay nilustay niya ang yaman ng kanyang kabataan sa magarbo at walang saysay na pamumuhay.`;
//     const pagbasa2 = `Nang maubos ang kanyang kayamanan, bumagsak siya sa laylayan ng kahirapan. Gutom, pagod, at walang maasahan, napilitan siyang magtrabaho sa bukid upang mag-alaga ng baboy. Sa gitna ng kanyang pagdurusa, nagliwanag ang kanyang diwa at naantig ang kanyang puso sa pagnanais na bumalik sa kanyang ama.`;
//     const pagbasa3 = `Pag-uwi niya, malayo pa’y sinalubong siya ng ama na may yakap ng kapatawaran. Ipinagbunyi ng ama ang kanyang pagbabalik — isinuot sa kanya ang kasuotan ng dangal, isinukbit ang singsing ng pagtanggap, at isinapatos ang pagbangon mula sa pagkadusta.`;
//     const pagbasa4 = `Ngunit nagdilim ang loob ng panganay na anak, sapagkat inakala niyang hindi siya pinahalagahan. Ipinaliwanag ng ama na dapat silang magsaya sapagkat ang anak na minsang naligaw ay muling natagpuan, at ang dating patay sa kasalanan ay muling nabuhay sa kabutihan.`;

//     await sendMessage(psid, pagbasa1);
//     await new Promise((r) => setTimeout(r, 3000));
//     await sendMessage(psid, pagbasa2);
//     await new Promise((r) => setTimeout(r, 9000));
//     await sendMessage(psid, pagbasa3);
//     await new Promise((r) => setTimeout(r, 9000));
//     await sendMessage(psid, pagbasa4);
//     await new Promise((r) => setTimeout(r, 9000));

//   const nabasaPayload = {
//     recipient: { id: psid },
//     message: {
//       attachment: {
//         type: "template",
//         payload: {
//           template_type: "button",
//           text: "☺️ Nabasa mo na ang parabula?",
//           buttons: [{ type: "postback", title: "OPO!", payload: "NABASA_NA" }],
//         },
//       },
//     },
//   };

//   await callSendAPI(nabasaPayload);
// }

// async function sendNabasaNa(psid) {
//   const done = `wow`;

//     await sendMessage(psid, done);
//     await new Promise((r) => setTimeout(r, 1000));
// }











//---------------------------------------------------------------------//
//-------------------FUNCTIONS----------------------------------------//
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
//---------------------------------------------------------------------//