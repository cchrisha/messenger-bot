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

      // Debug: show PSID and current progress
      console.log("User PSID:", sender_psid);
      console.log("Current progress:", userProgress[sender_psid]);

      // user sends a text
      if (event.message && event.message.text) {
        const userMessage = event.message.text.trim().toLowerCase();
        console.log("User message:", userMessage);

        // user in icebreaker mode
        if (userProgress[sender_psid]?.mode === "PAGTATAYA") {
          console.log("handleUserAnswer2 triggered for PSID:", sender_psid);
          await handleUserAnswer2(sender_psid, userMessage);
        } else if (userProgress[sender_psid]) {
          console.log("handleUserAnswer triggered for PSID:", sender_psid);
          await handleUserAnswer(sender_psid, userMessage);
        } else if (userMessage === "grade 9" || userMessage === "grade9") {
          userProgress[sender_psid] = "INTRO_STARTED";
          console.log(`userProgress[${sender_psid}] = INTRO_STARTED`);
          await sendIntro(sender_psid);
        } else {
          console.log("Ignored message:", userMessage);
        }
      }

      if (event.message && event.message.text && userProgress[sender_psid] === "WAITING_OPINIONATED_ANSWER") {
        console.log("handleOpinionatedAnswer triggered for PSID:", sender_psid);
        await handleOpinionatedAnswer(sender_psid);
        userProgress[sender_psid] = "AFTER_OPINIONATED_ANSWER"; //track done with opinionated answer
        console.log(`userProgress[${sender_psid}] = AFTER_OPINIONATED_ANSWER`);
      }
      if (event.message && event.message.text && userProgress[sender_psid] === "WAITING_OPINIONATED_ANSWER2") {
        console.log("handleOpinionatedAnswerV2 triggered for PSID:", sender_psid);
        await handleOpinionatedAnswerV2(sender_psid);
        userProgress[sender_psid] = "AFTER_OPINIONATED_ANSWER2"; //track done with opinionated answer
        console.log(`userProgress[${sender_psid}] = AFTER_OPINIONATED_ANSWER2`);
      }

      if (event.postback) {
        const payload = event.postback.payload;

        const setProgress = (value) => {
          userProgress[sender_psid] = value;
          console.log(`userProgress[${sender_psid}] = ${value}`);
        };

        console.log("Received postback payload:", payload);
        console.log("Current progress before postback:", userProgress[sender_psid]);

        if (payload === "YES_LEARN") {
          setProgress("READY_LEARN");
          await sendReadyMessage(sender_psid);

        } else if (payload === "YES_ACTIVITY") {
          setProgress("ACTIVITY_STARTED");
          await sendNextActivity(sender_psid);

        } else if (payload === "SAAN_PO") {
          if (userProgress[sender_psid] === "PARABULA_LESSON") {
            console.log("Ignored duplicate SAAN_PO during parabula lesson for PSID:", sender_psid);
          } else {
            setProgress("PARABULA_LESSON");
            await sendParabulaLesson(sender_psid);
          }
        } else if (payload === "UNDERSTOOD_PARABULA") {
          setProgress("WAITING_OPINIONATED_ANSWER");
          await sendNaunawaan(sender_psid);

        } else if (payload === "UNDERSTOOD2_PARABULA") {
          setProgress("UNDERSTOOD_PARABULA_FINAL");
          await sendNextNaunawaan(sender_psid);

        } else if (payload === "NOTUNDERSTOOD2_PARABULA") {
          setProgress("RETEACH_PARABULA");
          await sendNotNaunawaan(sender_psid);

        } else if (payload === "OPO_READ") {
          // prevent duplicate triggers if already reading
          if (userProgress[sender_psid] === "READING_PARABULA") {
            console.log("Ignored duplicate OPO_READ during reading for PSID:", sender_psid);
            // do not return the whole webhook; just skip this branch
          } else {
            setProgress("READING_PARABULA");
            console.log("Starting parabula reading for PSID:", sender_psid);
            await sendParabulaPagbasa(sender_psid);
          }

        } else if (payload === "NABASA_NA") {
          setProgress("READ_DONE");
          console.log("User marked reading done for PSID:", sender_psid);
          await sendNabasaNa(sender_psid);
        } else if (payload === "MAGPATULOY") {
          await sendMagpatuloy(sender_psid);
        } else if (payload === "OO_PARABULA") {
          await sendAyanan(sender_psid);
        } else if (payload === "HINDI_PARABULA") {
          await sendBalikan(sender_psid);
        } else if (payload === "NAUNAWAAN_PARABULA") {
          await sendAyanan(sender_psid);
        } else if (payload === "HANDA") {
          await sendPanuto(sender_psid);
        } else if (payload === "HANDA_NA") {
          await sendSimulan(sender_psid);
        } else if (payload === "NAUUNAWAAN") {
          await sendPaalam(sender_psid);
        }
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
    userProgress[psid] = "INTRO";
    const intro1 = `𝗙𝟵𝗣𝗧-𝗜𝗜𝗜𝗮-𝟱𝟬`;
    const intro2 = `Nabibigyang-kahulugan ang matatalinghagang pahayag sa parabula`;
    const introText = `👋 Kumusta!\n\n🤓 Ako si 𝗦𝗶𝗿 𝗚𝗹𝗲𝗻 𝗢𝗹𝗶𝘃𝗲𝗿 o mas kilala bilang si 𝗦𝗶𝗿 𝗚𝗼, ang iyong Filipino ChatBot. Ngayon ay magsisimula na tayo sa ating bagong aralin para sa ikatlong markahan sa unang sesyon sa Filipino.\n\n🥰 Panibagong talakayan, dagdag kaalaman!`;
    const learnText = `🤓 Handa ka na bang matuto?`;

    console.log("Sending introduction to PSID:", psid);

    await sendMessage(psid, intro1);
    await sendMessage(psid, intro2);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, introText);
    await new Promise((r) => setTimeout(r, 3000));

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
    userProgress[psid] = "READY_MESSAGE";
    const text1 = `😄 Ayan! Handa na nga siya!`;
    const text2 = `😄 Ngayon, bago tayo magsimula sa ating pormal na talakayan ay magkakaroon muna tayong paunang gawain.`;
    const text3 = `🤓 Tinatawag ko itong “𝗣𝗨𝗡𝗔𝗡 𝗔𝗧 𝗛𝗨𝗟𝗔𝗔𝗡”, na kung saan kinakailangan mong mahulaan ang mga larawan na iyong makikita at may mga patlang na iyong pupunan upang makabuo ng isang salita.`;

    console.log("Starting ready message for PSID:", psid);

    await sendMessage(psid, text1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, text2);
    await new Promise((r) => setTimeout(r, 2500));
    await sendMessage(psid, text3);
    await new Promise((r) => setTimeout(r, 3500));

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
  console.log("Starting next activity for PSID:", psid);
  await sendMessage(psid, "😄 Ayan! Magsimula na tayo!");
  userProgress[psid] = 1; // start question 1
  await new Promise((r) => setTimeout(r, 1000));
  await sendQuestion(psid, 1);
}

// send question
async function sendQuestion(psid, number) {
  let question = "";

  console.log("sendQuestion", number, "for PSID:", psid);

  if (number === 1) {
    await sendMessage(psid, "Sa unang larawan, ano ang iyong napansin at ano ang iyong sagot");
    await sendImage(psid, "https://i.imgur.com/rvx4L1e.jpg");
    question = "\n\nB \u200B_ \u200BB \u200BL \u200B_ \u200B_ \u200BA";
  } else if (number === 2) {
    await sendMessage(psid, "Sumunod?");
    await sendImage(psid, "https://i.imgur.com/gkt7Kr9.jpg");
    question = "G \u200B_ \u200BS \u200BT \u200B_ \u200B_ \u200BO \u200B_";
  } else if (number === 3) {
    await sendMessage(psid, "Ikatlong larawan.");
    await sendImage(psid, "https://i.imgur.com/gUk0MqT.jpg");
    question = "\n\n\u200B_ \u200BA \u200B_ \u200BA \u200BS \u200B_ \u200BL \u200BA \u200B_ \u200B_ \u200BN";
  } else {
    await sendMessage(psid, `🥰 Ayan! Maraming salamat sa pagsagot!`);
    await new Promise((r) => setTimeout(r, 1000));

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
    console.log("Cleared userProgress after icebreaker for PSID:", psid);
    return;
  }

  await sendMessage(psid, question);
}
//end of icebreaker

// parabula lesson
async function sendParabulaLesson(psid) {
    if (userProgress[psid] !== "PARABULA_LESSON") {
    userProgress[psid] = "PARABULA_LESSON";
    console.log("userProgress set to PARABULA_LESSON for PSID:", psid);
    } else {
      console.log("user already in PARABULA_LESSON for PSID:", psid);
    }

    const parabula1 = "🤓 Ang ating magiging talakayan ay patungkol sa 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮!";
    const parabula2 = "🧐 𝗦𝗶𝗿 𝗚𝗼, ano po ba ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?";
    const parabula3 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆. Karaniwang ito ay batay sa mga aral ni Hesus mula sa Bibliya, ngunit maaari rin itong gamitin sa mas malawak na konteksto bilang kuwentong may 𝘁𝗮𝗹𝗶𝗻𝗵𝗮𝗴𝗮 𝗼 𝘀𝗶𝗺𝗯𝗼𝗹𝗶𝘀𝗺𝗼 na nagtuturo ng mabuting asal.`;
    const parabula4 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay 𝗽𝗮𝗴𝘁𝘂𝘁𝘂𝗹𝗮𝗱 𝗼 𝗽𝗮𝗴𝗵𝗮𝗵𝗮𝗺𝗯𝗶𝗻𝗴. Ibig sabihin, sa parabula ay may isang kuwento na ginagawang halimbawa upang ipaliwanag ang mas malalim na katotohanan.`;
    const parabula5 = `📖 Karaniwan, ang mga tauhan ay tao at ang mga pangyayari ay may malalim na kahulugang espiritwal.`;

    console.log("sendParabulaLesson for PSID:", psid);

    await sendMessage(psid, parabula1);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, parabula2);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, parabula3);
    await new Promise((r) => setTimeout(r, 5000));
    await sendMessage(psid, parabula4);
    await new Promise((r) => setTimeout(r, 5000));
    await sendMessage(psid, parabula5);
    await new Promise((r) => setTimeout(r, 2000));

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
  console.log("Finished reading and sent NABASA_NA prompt for PSID:", psid);
  return;
}

//nauunawaan with opinionated answer
async function sendNaunawaan(psid) {
    
    const nauunawaan1 = `✅ Okay, sige!`;
    const nauunawaan2 = `🤔 Kung talagang nauunawaan mo. Ano nga uli ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?\n\n(Ipahayag ang sagot.)`;

    console.log("sendNaunawaan for PSID:", psid);

    await sendMessage(psid, nauunawaan1);
    await new Promise((r) => setTimeout(r, 1500));
    await sendMessage(psid, nauunawaan2);
    await new Promise((r) => setTimeout(r, 1000));

    userProgress[psid] = "WAITING_OPINIONATED_ANSWER";
    console.log("userProgress set to WAITING_OPINIONATED_ANSWER for PSID:", psid);
}

// handle opinionated answer
async function handleOpinionatedAnswer(psid) {
    userProgress[psid] = "AFTER_OPINIONATED_ANSWER";
    console.log("handleOpinionatedAnswer for PSID:", psid);
    await sendMessage(psid, "✅ Ayan! Mahusay!");
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, "📖 Sa madaling sabi, ito ay kuwentong may aral na nagtuturo ng mabuting asal at pananampalataya.");
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, "📖 Dagdag pa na ang parabula ay isinusulat upang magturo, hindi lang para maglibang at magbigay aliw.");
    await new Promise((r) => setTimeout(r, 1500));

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
    userProgress[psid] = "RETEACHING";
    const notnicemsg = `😌 Okay, sige! Balikan natin`;
    const explain1 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆.`;
    const explain2 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay pagtutulad o paghahambing.`;

    console.log("sendNotNaunawaan for PSID:", psid);

    await sendMessage(psid, notnicemsg);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, explain1);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, explain2);
    await new Promise((r) => setTimeout(r, 1500));

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
    userProgress[psid] = "READY_FOR_READING";
    const nicemsg = `🤓 Tunay ngang nauunawaan!`;
    const pagbasa = `📖 Ngayon ay magbabasa tayo at unaawain natin ang isang parabulang pinamagatang "𝗔𝗻𝗴 𝗔𝗹𝗶𝗯𝘂𝗴𝗵𝗮𝗻𝗴 𝗔𝗻𝗮𝗸" na matatagpuan sa sangunian ng bibliya sa ebanghelyo ni San Lucas sa kabanata 15, talata 11 hanggang 32 (Luke 15:11–32). `;

    console.log("sendNextNaunawaan for PSID:", psid);

    await sendMessage(psid, nicemsg);
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, pagbasa);
    await new Promise((r) => setTimeout(r, 2000));

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
  console.log("UserProgress set to READY_FOR_READING for PSID:", psid);
  return;
}

async function sendParabulaPagbasa(psid) {
    if (userProgress[psid] !== "READING_PARABULA") {
      userProgress[psid] = "READING_PARABULA";
      console.log("userProgress set to READING_PARABULA for PSID:", psid);
    } else {
      console.log("user already in READING_PARABULA for PSID:", psid);
    }

    const pagbasa1 = `May isang ama na may dalawang anak. Isang araw, hiningi ng bunsong anak ang kanyang mamanahin at lumayo sa kandungan ng ama upang makipagsapalaran sa malayong lupain. Doon ay nilustay niya ang yaman ng kanyang kabataan sa magarbo at walang saysay na pamumuhay.`;
    const pagbasa2 = `Nang maubos ang kanyang kayamanan, bumagsak siya sa laylayan ng kahirapan. Gutom, pagod, at walang maasahan, napilitan siyang magtrabaho sa bukid upang mag-alaga ng baboy. Sa gitna ng kanyang pagdurusa, nagliwanag ang kanyang diwa at naantig ang kanyang puso sa pagnanais na bumalik sa kanyang ama.`;
    const pagbasa3 = `Pag-uwi niya, malayo pa’y sinalubong siya ng ama na may yakap ng kapatawaran. Ipinagbunyi ng ama ang kanyang pagbabalik — isinuot sa kanya ang kasuotan ng dangal, isinukbit ang singsing ng pagtanggap, at isinapatos ang pagbangon mula sa pagkadusta.`;
    const pagbasa4 = `Ngunit nagdilim ang loob ng panganay na anak, sapagkat inakala niyang hindi siya pinahalagahan. Ipinaliwanag ng ama na dapat silang magsaya sapagkat ang anak na minsang naligaw ay muling natagpuan, at ang dating patay sa kasalanan ay muling nabuhay sa kabutihan.`;

    console.log("Begin reading for PSID:", psid);

    await sendMessage(psid, pagbasa1);
    await new Promise((r) => setTimeout(r, 10000));
    await sendMessage(psid, pagbasa2);
    await new Promise((r) => setTimeout(r, 10000));
    await sendMessage(psid, pagbasa3);
    await new Promise((r) => setTimeout(r, 10000));
    await sendMessage(psid, pagbasa4);
    await new Promise((r) => setTimeout(r, 9000));

  const nabasaPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "☺️ Nabasa mo na ang parabula?",
          buttons: [{ type: "postback", title: "OPO!", payload: "NABASA_NA" }],
        },
      },
    },
  };

  await callSendAPI(nabasaPayload);
  console.log("Finished reading and sent NABASA_NA prompt for PSID:", psid);
  return;
}

// After reading parabula
async function sendNabasaNa(psid) {
  userProgress[psid] = "WAITING_OPINIONATED_ANSWER2";
  console.log("sendNabasaNa for PSID:", psid, " — state set to WAITING_OPINIONATED_ANSWER");

  const done = `⭐ Kung gayon! Mula sa iyong nabasang parabula, ano ang napansin mo?\n\n(Ipahayag ang sagot.)`;

  await sendMessage(psid, done);
  await new Promise((r) => setTimeout(r, 1000));
}

// When user sends their opinion
async function handleOpinionatedAnswerV2(psid) {
  userProgress[psid] = "AFTER_OPINIONATED_ANSWER2";
  console.log("handleOpinionatedAnswer for PSID:", psid, " — state set to AFTER_OPINIONATED_ANSWER");

  await sendMessage(psid, "🙂 Ayaaan! Salamat!");
  await new Promise((r) => setTimeout(r, 1000));

  await sendMessage(psid, `🤩 Ito rin ay naglalaman ng mga matatalinhagang mga pahayag at mga salita. Pinapakita rin dito sa kwento na kung saan, ang anak ay isang maalibugha o sobrang gastos at hindi marunong magpahalaga sa pera dahil sinasayang o ginagasta niya ito sa maling paraan.`);
  await new Promise((r) => setTimeout(r, 3000));

  const magpatuloyPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `🤓 Makikita rin na ang mga pahayag ay may ibang ibig-sabihin o gumagamit ng mga salitang matalinhaga tulad ng pahayag na 𝗯𝘂𝗺𝗮𝗴𝘀𝗮𝗸 𝘀𝗶𝘆𝗮 𝘀𝗮 𝗹𝗮𝘆𝗹𝗮𝘆𝗮𝗻 𝗻𝗴 𝗸𝗮𝗵𝗶𝗿𝗮𝗽𝗮𝗻 na ang ibig-sabihin ay nawalan na ng pag-asa at 𝗻𝗮𝗴𝗹𝗶𝘄𝗮𝗻𝗮𝗴 𝗮𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗱𝗶𝘄𝗮 na ang ibig-sabihin ay nabuhayan o nagkaroon ng pag-asa.`,
          buttons: [
            { type: "postback", title: "MAGPATULOY", payload: "MAGPATULOY" },
          ],
        },
      },
    },
  };

  await callSendAPI(magpatuloyPayload);
}

async function sendMagpatuloy(psid) {
  const msg1 = `😄 Kung makikita rin na hindi pang karaninwang ginagamit ang mga salita na ating nabasa sa parabula sa ating pang-araw-araw na pamumuhay.`;
  const msg2 = `🤓 Ipinapakita sa kuwento na gaano man kalayo o kalalim ang pagkakamali ng isang tao, laging may pagkakataon para magsisi at magbagong-buhay.`;
  const msg3 = `😇 Ang ama sa parabula ay sumasagisag sa Diyos na mapagpatawad at laging handang tanggapin ang kanyang mga anak na nagsisisi. Itinuturo rin nito ang kahalagahan ng kababaang-loob sa pagkilala ng sariling pagkukulang at ang pagpapatawad sa kapwa.`;

  await sendMessage(psid, msg1);
  await new Promise((r) => setTimeout(r, 3000));
  await sendMessage(psid, msg2);
  await new Promise((r) => setTimeout(r, 3500));
  await sendMessage(psid, msg3);
  await new Promise((r) => setTimeout(r, 5500));

  const naunawaanparabulaPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `🧐 Nauunawaan ba ang nabasang parabula na pinamagatang "Ang Alibughang Anak"?`,
          buttons: [
            { type: "postback", title: "OPO!", payload: "OO_PARABULA" },
            { type: "postback", title: "HINDI PO.", payload: "HINDI_PARABULA" },
          ],
        },
      },
    },
  };

  await callSendAPI(naunawaanparabulaPayload);
}


//Balikan kung hindi naunawaan
async function sendBalikan(psid) {
  const balikan = `🫡 Okay, sige. Balikan natin.`;
  const msg1 = `😇 Ang ama sa parabula ay sumasagisag sa Diyos na mapagpatawad at laging handang tanggapin ang kanyang mga anak na nagsisisi. Itinuturo rin nito ang kahalagahan ng kababaang-loob sa pagkilala ng sariling pagkukulang at ang pagpapatawad sa kapwa.`;
  const msg2 = `🤓 Makikita sa mga pahayag ay may ibang ibig-sabihin o gumagamit ng mga salitang matalinhaga tulad ng pahayag na 𝗯𝘂𝗺𝗮𝗴𝘀𝗮𝗸 𝘀𝗶𝘆𝗮 𝘀𝗮 𝗹𝗮𝘆𝗹𝗮𝘆𝗮𝗻 𝗻𝗴 𝗸𝗮𝗵𝗶𝗿𝗮𝗽𝗮𝗻 na ang ibig-sabihin ay nawalan na ng pag-asa at 𝗻𝗮𝗴𝗹𝗶𝘄𝗮𝗻𝗮𝗴 𝗮𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗱𝗶𝘄𝗮 na ang ibig-sabihin ay nabuhayan o nagkaroon ng pag-asa`;

  await sendMessage(psid, balikan);
  await new Promise((r) => setTimeout(r, 1000));
  await sendMessage(psid, msg1);
  await new Promise((r) => setTimeout(r, 3500));
  await sendMessage(psid, msg2);
  await new Promise((r) => setTimeout(r, 3000));

  const naunawaanparabula2Payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `🧐 Nauunawaan ba ang nabasang parabula na pinamagatang "Ang Alibughang Anak"?`,
          buttons: [
            { type: "postback", title: "OPO!", payload: "NAUNAWAAN_PARABULA" },
          ],
        },
      },
    },
  };

  await callSendAPI(naunawaanparabula2Payload);
}

async function sendAyanan(psid) {
  const ayaaaan = `🤓  Ayaaan! Sige!`;
  const ayaaaan2 = `Ngayon ay dumako na tayo sa ating pagtataya upang malaman natin kung talagang may natutuhan kayo!`;

//naunawaan 
  await sendMessage(psid, ayaaaan);
  await new Promise((r) => setTimeout(r, 1000));
  await sendMessage(psid, ayaaaan2);
  await new Promise((r) => setTimeout(r, 1500));

  const handakanaPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "😄 Handa ka na ba?",
          buttons: [
            { type: "postback", title: "OPO!", payload: "HANDA" },
          ],
        },
      },
    },
  };

  await callSendAPI(handakanaPayload);
  console.log("Sent HANDA button to PSID:", psid);
}

async function sendPanuto(psid) {
  const panuto1 = `✅ Sige, ating nang simulan!`;
  const panuto2 = `𝗣𝗮𝗻𝘂𝘁𝗼: Piliin ang 𝗧𝗜𝗧𝗜𝗞 ng tamang sagot. Basahin nang mabuti ang tanong at piliin ang wastong sagot.`;

  await sendMessage(psid, panuto1);
  await new Promise((r) => setTimeout(r, 1000));
  await sendMessage(psid, panuto2);
  await new Promise((r) => setTimeout(r, 1500));

  const quizhandaPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `🤓 Handa ka na ba?`,
          buttons: [
            { type: "postback", title: "OPO!", payload: "HANDA_NA" },
          ],
        },
      },
    },
  };

  await callSendAPI(quizhandaPayload);
}

async function sendSimulan(psid) {
  const panuto1 = `✅ Sige, ating nang simulan!`;
  await sendMessage(psid, panuto1);
  userProgress[psid] = 1; // start question 1
  await new Promise((r) => setTimeout(r, 1000));
  await sendPagtataya(psid, 1);
}


async function sendPagtataya(psid, number = 1) {
  let question = "";

  console.log("sendPagtataya for PSID:", psid, "number:", number);

  if (number === 1) {
    await sendMessage(psid, "𝟭. Ang mga parabula ay nababasa partikular sa bagong tipan ng bibliya ito matatagpuan na naglalaman ng moral at espiritwal na aspekto ng buhay.");
    question = "A. TAMA\nB. MALI\nC. Both A & B.";
  } else if (number === 2) {
    await sendMessage(psid, "𝟮. Ang parabula ay isang uri ng maikling kuwento na nagtuturo ng ______?");
    question = "A. Aral sa moral at espiritwal na aspeto ng buhay.\nB. Nagtuturo ng mga maling adikhain.\nC. Nagpapakita ng mga kwento na ang pangunahing tauhan ay hayop.";
  } else if (number === 3) {
    await sendMessage(psid, "𝟯. Nilustay ng anak ang kanyang pera sa maling paraan. Ano ang ibig-sabihin ng matalinhagang salitang naka-mariin?");
    question = "A. Tinipid.\nB. Tinabi.\nC. Ginastos.";
  } else if (number === 4) {
    await sendMessage(psid, "𝟰. Nagliwanag ang kanyang diwa at naantig ang kanyang puso sa pagnanais na bumalik sa kanyang ama. Ano ang ibig-sabihin ng pahayag na nagliwanag ang kanyang diwa?");
    question = "A. Umilaw ang kanyang kaluluwa.\nB. Nagising sa katotohanan.\nC. Bumalik sa pinagmulan.";
  } else if (number === 5) {
    await sendMessage(psid, "𝟱.\"Ipinaliwanag ng ama na dapat silang magsaya sapagkat ang anak na minsang naligaw ay muling natagpuan, at ang dating patay sa kasalanan ay muling nabuhay sa kabutihan\". Ayon sa pahayag na iyong binasa, ang salitang matalinhagang naka-mariin ay nagpapahayag na ang anak ay?");
    question = "A. Namatay sa paggastos ng pera.\nB. Nagbagong buhay at tinuwid ang sarili.\nC. Namatay ngunit muling nabuhay.";
  }

  await sendMessage(psid, question);
  userProgress[psid] = { mode: "PAGTATAYA", current: number, score: userProgress[psid]?.score || 0 };
  console.log("Cleared userProgress after icebreaker for PSID:", psid);
  return;
}

async function sendPaalam(psid) {
  const paalamMsg = `🤓 Ayan! Maraming salamat sa pakikibaka sa ating talakayan ngayong araw! Galingan at husayan pa sa susunod na talakayan! Paalam! 🐢`;
  await sendMessage(psid, paalamMsg);
}

//---------------------------------------------------------------------//
//-------------------FUNCTIONS----------------------------------------//
// handle answers icebreaker
async function handleUserAnswer(psid, userMessage) {
  if (!userProgress[psid]) return; // not icebreaker mode

  const current = userProgress[psid];
  const answer = userMessage.trim().toLowerCase();

  console.log("handleUserAnswer: PSID:", psid, "state:", current, "answer:", answer);

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
    userProgress[psid] = "ICEBREAKER_DONE";
    await new Promise((r) => setTimeout(r, 1000));
    await sendQuestion(psid, 4);
  } else {
    console.log("handleUserAnswer: unexpected or incorrect answer for PSID:", psid);
  }
}

async function handleUserAnswer2(psid, userMessage) {
  const progress = userProgress[psid];
  if (!progress || progress.mode !== "PAGTATAYA") return;

  const current = progress.current;
  const answer = userMessage.trim().toUpperCase(); // better to use uppercase for match
  console.log("handleUserAnswer2: PSID:", psid, "question:", current, "answer:", answer);

  // correct answers map
  const correctAnswers = {
    1: "A",
    2: "A",
    3: "C",
    4: "B",
    5: "B",
  };

  // store user’s answer and check if correct
  if (answer === correctAnswers[current]) {
    progress.score = (progress.score || 0) + 1;
  }

  // move to next question if not done
  if (current < 5) {
    progress.current = current + 1;
    await new Promise((r) => setTimeout(r, 1000));
    await sendPagtataya(psid, progress.current);
  } else {
    // show final results only after the last question
    const score = progress.score || 0;
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, `Tapos ka na sa pagtataya!\n\n✅ Kabuuang Iskor: ${score}/5`);
    await sendMessage(psid, "Narito ang tamang sagot:\n1. A\n2. A\n3. C\n4. B\n5. B");
    userProgress[psid] = "PAGTATAYA_DONE";

    // ✅ MOVE YOUR REFLECTION SECTION INSIDE HERE
    await new Promise((r) => setTimeout(r, 1500));
    await sendMessage(psid, "🥰 Ayaaan! Tunay ngang may natutuhan ang ating klase sa ating talakayan.");
    await new Promise((r) => setTimeout(r, 1000));
    await sendMessage(psid, "😌 Bago matapos ang ating talakayan, bilang kasunduan ay nais ko sanang sagutan mo itong mga tanong na ito sa sagutang papel para sa ating susunod na talakayan.\n\nIto ang ating mga gabay na tanong:\n\n𝟭. Ano ang katangian ng inyong magulang ang sumasalamin sa katauhan ng ama sa parabulang nabasa natin?\n\n𝟮. Paano nyo pinahahalagahan ang pagmamahal at pag-aaruga ng inyong mga magulang?");
    await new Promise((r) => setTimeout(r, 4000));
    await sendMessage(psid, "✅ Ayaaaaan! Nauunawaan ba ang ating buong talakayan sa araw na ito?");
    await new Promise((r) => setTimeout(r, 1500));

    const closingPayload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "⭐ Maari mong pindutin ang \"NAUUNAWAAN\" sa ibaba kung nauunawaan ang ating talakayan ngayong araw.",
            buttons: [{ type: "postback", title: "NAUUNAWAAN", payload: "NAUUNAWAAN" }],
          },
        },
      },
    };
    await callSendAPI(closingPayload);
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
