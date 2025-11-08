//remove this if di gumana
import dotenv from "dotenv";


import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

//remove this if di gumana
dotenv.config();


const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

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
        
        if (userProgress[sender_psid]) {
          console.log("handleUserAnswer triggered for PSID:", sender_psid);
          await handleUserAnswer(sender_psid, userMessage);
        } 
        // first, check if user wants to start/restart
        if (userMessage === "filipino9") {
          const progress = userProgress[sender_psid];

          if (!progress || progress === "PAALAM_SENT") {
            userProgress[sender_psid] = "INTRO_STARTED";
            console.log(`userProgress[${sender_psid}] = INTRO_STARTED`);
            await sendIntro(sender_psid);
          }
        }
        // then, handle answers only if the user is already in a lesson
        else if (userProgress[sender_psid]) {
          console.log("handleUserAnswer triggered for PSID:", sender_psid);
          await handleUserAnswer(sender_psid, userMessage);
        }
        else {
          console.log("Ignored message:", userMessage);
        }
      }


      if (event.message && event.message.text && userProgress[sender_psid] === "WAITING_OPINIONATED_ANSWER") {
        console.log("handleOpinionatedAnswer triggered for PSID:", sender_psid);
        await handleOpinionatedAnswer(sender_psid);
        userProgress[sender_psid] = "AFTER_OPINIONATED_ANSWER"; //track done with opinionated answer
        console.log(`userProgress[${sender_psid}] = AFTER_OPINIONATED_ANSWER`);
      }
      if (event.message && !event.message.is_echo && event.message.text) {
        const state = userProgress[sender_psid];
        const userText = event.message.text.trim();

        console.log(`handleUserAnswer: PSID: ${sender_psid}, state: ${state}, answer: ${userText}`);

        switch (state) {
          case "WAITING_OPINIONATED_ANSWER2":
            console.log("→ handleOpinionatedAnswerV2 triggered");
            await handleOpinionatedAnswerV2(sender_psid);
            break;

          case "WAITING_OPINIONATED_ANSWER3":
            console.log("→ handleOpinionatedAnswerV3 triggered");
            await handleOpinionatedAnswerV3(sender_psid);
            break;

          default:
            console.log(`(ignored) No matching state for PSID: ${sender_psid}`);
            break;
        }
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
          
        } else if (payload === "MAGPATULOY") {
          setProgress("CONTINUE_PARABULA");
          await sendParabulaMagpatuloy(sender_psid);

        } else if (payload === "NABASA_NA") {
          setProgress("READ_DONE, PAHAYAG");
          console.log("User marked reading done for PSID:", sender_psid);
          userProgress[sender_psid] = 1;
          await sendPahayag(sender_psid, 1);
          
        }  
        else if (["A1", "B1", "A2", "B2", "A3", "B3"].includes(payload)) {
          await handlePahayagResponse(payload, sender_psid);
        } 

        else if (payload === "OPO_PAHAYAG") {
          setProgress("PAGLALAHAT_STARTED");
          userProgress[sender_psid] = 1;
          await sendPaglalahat(sender_psid, 1);
        }
        else if (/^P_[A-C][1-5]$/.test(payload)) {
          // Initialize mode if not already set or state was a string
          if (
            !userProgress[sender_psid] ||
            typeof userProgress[sender_psid] !== "object" ||
            userProgress[sender_psid] === "PAGTATAYA_DONE"
          ) {
            userProgress[sender_psid] = { mode: "PAGTATAYA", current: 1, score: 0 };
          }

          // Ensure we’re tracking the question properly
          if (typeof userProgress[sender_psid].current === "undefined") {
            userProgress[sender_psid].current = 1;
          }

          await handlePAGTATAYA(sender_psid, payload);
        }
        else if (payload === "PAALAM") {
          await sendPaalam(sender_psid);
        } else if (payload === "RETRY_PAGTATAYA") {
          userProgress[sender_psid] = { mode: "PAGTATAYA", current: 1, score: 0 };
          await sendPagtataya(sender_psid, 1);
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
    const intro1 = `👋 Kumusta, Mag-aaral!`;
    const intro2 = `🤓 Ako si 𝗦𝗶𝗿 𝗚𝗼, ang iyong Filipino ChatBot. Ngayon ay magsisimula na tayo sa ating bagong aralin sa Filipino.`;
    const introText = `Panibagong talakayan, dagdag kaalaman!`;
    const learnText = `Handa ka na bang matuto?`;


    console.log("Sending introduction to PSID:", psid);


    await sendMessage(psid, intro1);
    await sendMessage(psid, intro2);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, introText);
    await new Promise((r) => setTimeout(r, 2000));


    const payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: learnText,
            buttons: [{ type: "postback", title: "OPO", payload: "YES_LEARN" }],
          },
        },
      },
    };
    await callSendAPI(payload);
}
//YES_LEARN
//--------------------end of intro-----------------------//



// INTRODUCTION ng ice breaker
async function sendReadyMessage(psid) {
    userProgress[psid] = "READY_MESSAGE";
    const text1 = `Ayan! Handa na nga siya!`;
    const text2 = `Ngayon, bago tayo magsimula sa ating pormal na talakayan ay magkakaroon muna tayong paunang gawain.`;
    const text3 = `Tinatawag ko itong “𝗣𝗨𝗡𝗔𝗡 𝗔𝗧 𝗛𝗨𝗟𝗔𝗔𝗡”, na kung saan kinakailangan mong mahulaan ang mga larawan na iyong makikita at may mga patlang na iyong pupunan upang mabuo ang salita.`;


    console.log("Starting ready message for PSID:", psid);


    await sendMessage(psid, text1);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, text2);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, text3);
    await new Promise((r) => setTimeout(r, 2000));


    const payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Handa ka na ba?",
          buttons: [{ type: "postback", title: "OPO", payload: "YES_ACTIVITY" }],
        },
      },
    },
  };
  await callSendAPI(payload);
}
//YES_ACTIVITY



// start the icebreaker
async function sendNextActivity(psid) {
  console.log("Starting next activity for PSID:", psid);
  await sendMessage(psid, "Ayan! Magsimula na tayo!");
  userProgress[psid] = 1; // start question 1
  await new Promise((r) => setTimeout(r, 2000));
  await sendQuestion(psid, 1);
}


// send question punan at hulaan
async function sendQuestion(psid, number) {
  let question = "";


  console.log("sendQuestion", number, "for PSID:", psid);


  if (number === 1) {
    await sendMessage(psid, "Sa unang larawan, ano ang iyong napansin at ano ang iyong sagot?");
    await sendImage(psid, "https://i.imgur.com/rvx4L1e.jpg");
    question = "B \u200B_ \u200BB \u200BL \u200B_ \u200B_ \u200BA";
  } else if (number === 2) {
    await sendMessage(psid, "Sumunod?");
    await sendImage(psid, "https://i.imgur.com/gkt7Kr9.jpg");
    question = "G \u200B_ \u200BS \u200BT \u200B_ \u200B_ \u200BO \u200B_";
  } else if (number === 3) {
    await sendMessage(psid, "Sa ikatlong larawan?");
    await sendImage(psid, "https://i.imgur.com/gUk0MqT.jpg");
    question = "\u200B_ \u200BA \u200B_ \u200BA \u200BS \u200B_ \u200BL \u200BA \u200B_ \u200B_ \u200BN";
  } else {
    await sendMessage(psid, `Ayan! Maraming salamat sa pagsagot!`);
    await new Promise((r) => setTimeout(r, 2000));

    // start parabula
    const questionPayload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "Kung makikita, ang ating magiging talakayan ay patungkol saan?",
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
//SAAN_PO PARABULA




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
    const parabula3 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆. Karaniwan, ito ay nakabatay sa mga aral ni Hesus na mula sa Bibliya, ngunit maaari rin itong gamitin sa mas malawak na konteksto bilang kuwentong may 𝘁𝗮𝗹𝗶𝗻𝗵𝗮𝗴𝗮 𝗼 𝘀𝗶𝗺𝗯𝗼𝗹𝗶𝘀𝗺𝗼 na nagtuturo ng mabuting asal.`;
    const parabula4 = `📖 Ang parabula ay nagmula sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay 𝗽𝗮𝗴𝘁𝘂𝘁𝘂𝗹𝗮𝗱 𝗼 𝗽𝗮𝗴𝗵𝗮𝗵𝗮𝗺𝗯𝗶𝗻𝗴. Ibig sabihin, sa parabula ay may mga kuwento na ginagawang halimbawa upang ipaliwanag ang mas malalim na katotohanan at upang maisabuhay ang moral at aral na aspekto nito.`;
    const parabula5 = `📖 Karaniwan, ang mga tauhan dito ay mga tao at ang mga pangyayari ay may malalim na kahulugang pang-espiritwal.`;


    console.log("sendParabulaLesson for PSID:", psid);


    await sendMessage(psid, parabula1);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, parabula2);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, parabula3);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, parabula4);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, parabula5);
    await new Promise((r) => setTimeout(r, 2000));


  const understoodPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Nauunawaan ba?",
          buttons: [{ type: "postback", title: "OPO", payload: "UNDERSTOOD_PARABULA" }],
        },
      },
    },
  };

  await callSendAPI(understoodPayload);
  console.log("Finished reading and sent NABASA_NA prompt for PSID:", psid);
  return;
}
//UNDERSTOOD_PARABULA 




//nauunawaan with opinionated answer
async function sendNaunawaan(psid) {
   
    const nauunawaan1 = `✅ Okay, sige!`;
    const nauunawaan2 = `Kung talagang nauunawaan mo. Ano nga uli ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮?\n\n(Paki-type ang sagot)`;


    console.log("sendNaunawaan for PSID:", psid);


    await sendMessage(psid, nauunawaan1);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, nauunawaan2);
    await new Promise((r) => setTimeout(r, 2000));


    userProgress[psid] = "WAITING_OPINIONATED_ANSWER";
    console.log("userProgress set to WAITING_OPINIONATED_ANSWER for PSID:", psid);
}


// handle opinionated answer
async function handleOpinionatedAnswer(psid) {
    userProgress[psid] = "AFTER_OPINIONATED_ANSWER";
    console.log("handleOpinionatedAnswer for PSID:", psid);
    await sendMessage(psid, "✅ Ayan! Mahusay!");
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, "📖 Sa madaling sabi, ito ay kuwentong may aral na nagtuturo ng mabuting asal at pananampalataya.");
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, "📖 Dagdag pa na ang parabula ay isinusulat upang magturo ng tamang gawi, hindi lang para maglibang at magbigay aliw.");
    await new Promise((r) => setTimeout(r, 2000));

    const understood2Payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Nauunawaan ba?",
          buttons: [
            { type: "postback", title: "OPO", payload: "UNDERSTOOD2_PARABULA" },
            { type: "postback", title: "HINDI PO", payload: "NOTUNDERSTOOD2_PARABULA" }
          ],
        },
      },
    },
  };

  await callSendAPI(understood2Payload);
}
//UNDERSTOOD2_PARABULA
//NOTUNDERSTOOD2_PARABULA




//hindi nauunawaan
async function sendNotNaunawaan(psid) {
    userProgress[psid] = "RETEACHING";
    const notnicemsg = `✅ Okay, sige! Balikan natin.`;
    const explain1 = `📖 Ang 𝗽𝗮𝗿𝗮𝗯𝘂𝗹𝗮 ay isang maikling kuwento na nagtuturo ng 𝗮𝗿𝗮𝗹 𝘀𝗮 𝗺𝗼𝗿𝗮𝗹 𝗮𝘁 𝗲𝘀𝗽𝗶𝗿𝗶𝘁𝘄𝗮𝗹 𝗻𝗮 𝗮𝘀𝗽𝗲𝘁𝗼 𝗻𝗴 𝗯𝘂𝗵𝗮𝘆.`;
    const explain2 = `📖 Mula ito sa salitang 𝗴𝗿𝗶𝘆𝗲𝗴𝗼 na “𝗽𝗮𝗿𝗮𝗯𝗼𝗹𝗲” na ang ibig sabihin ay pagtutulad o paghahambing.`;

    console.log("sendNotNaunawaan for PSID:", psid);

    await sendMessage(psid, notnicemsg);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, explain1);
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, explain2);
    await new Promise((r) => setTimeout(r, 2000));

    const understood2Payload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Nauunawaan na ba?",
          buttons: [
            { type: "postback", title: "OPO", payload: "UNDERSTOOD2_PARABULA" },
            { type: "postback", title: "HINDI PO", payload: "NOTUNDERSTOOD2_PARABULA" }
          ],
        },
      },
    },
  };

  await callSendAPI(understood2Payload);
}
//UNDERSTOOD2_PARABULA
//NOTUNDERSTOOD2_PARABULA



//kung nauunawaan
async function sendNextNaunawaan(psid) {
    userProgress[psid] = "READY_FOR_READING";
    const nicemsg = `Tunay ngang nauunawaan!`;
    const pagbasa = `📖 Ngayon ay suriin at unaawain natin ang isang parabulang pinamagatang "𝗔𝗻𝗴 𝗔𝗹𝗶𝗯𝘂𝗴𝗵𝗮𝗻𝗴 𝗔𝗻𝗮𝗸" na matatagpuan sa sanggunian ng bibliya sa ebanghelyo ni San Lucas sa kabanata 15, talata 11 hanggang 32 (Luke 15:11–32). `;

    console.log("sendNextNaunawaan for PSID:", psid);

    await sendMessage(psid, nicemsg);
    await new Promise((r) => setTimeout(r, 2000));
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
            { type: "postback", title: "OPO", payload: "OPO_READ" },
          ],
        },
      },
    },
  };

  await callSendAPI(pagbasaPayload);
  console.log("UserProgress set to READY_FOR_READING for PSID:", psid);
  return;
}
// OPO_READ



async function sendParabulaPagbasa(psid) {
    if (userProgress[psid] !== "READING_PARABULA") {
      userProgress[psid] = "READING_PARABULA";
      console.log("userProgress set to READING_PARABULA for PSID:", psid);
    } else {
      console.log("user already in READING_PARABULA for PSID:", psid);
    }

    const pagbasa1 = `May isang ama na may dalawang anak. Isang araw, hiningi ng bunsong anak ang kanyang mamanahin at lumayo sa kandungan ng ama upang makipagsapalaran sa malayong lupain. Doon ay nilustay niya ang yaman ng kanyang kabataan sa magarbo at walang saysay na pamumuhay.`;

    console.log("Begin reading for PSID:", psid);

    await sendMessage(psid, pagbasa1);
    await new Promise((r) => setTimeout(r, 2000));

  const magpatuloyPayload = {
    recipient: { id: psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: `Nang maubos ang kanyang kayamanan, bumagsak siya sa laylayan ng kahirapan. Gutom, pagod, at walang maasahan, napilitan siyang magtrabaho sa bukid upang mag-alaga ng baboy. Sa gitna ng kanyang pagdurusa, nagliwanag ang kanyang diwa at naantig ang kanyang puso sa pagnanais na bumalik sa kanyang ama.`,
          buttons: [{ type: "postback", title: "MAGPATULOY", payload: "MAGPATULOY" }],
        },
      },
    },
  };


  await callSendAPI(magpatuloyPayload);
  console.log("Continue reading and sent CONTINUE_PARABULA prompt for PSID:", psid);
  return;
}
//MAGPATULOY



async function sendParabulaMagpatuloy(psid) {
  if (userProgress[psid] !== "CONTINUE_PARABULA") {
    userProgress[psid] = "CONTINUE_PARABULA";
    console.log("userProgress set to CONTINUE_PARABULA for PSID:", psid);
  } else {
    console.log("user already in CONTINUE_PARABULA for PSID:", psid);
  }


  const pagbasap1 = `Pag-uwi niya, malayo pa’y sinalubong siya ng ama na may yakap ng kapatawaran. Ipinagbunyi ng ama ang kanyang pagbabalik at isinuot sa kanya ang kasuotan ng dangal, isinukbit ang singsing ng pagtanggap, at isinapatos ang pagbangon mula sa pagkadusta.`;
  const pagbasap2 = `Ngunit nagdilim ang loob ng panganay na anak, sapagkat inakala niyang hindi siya pinahalagahan. Ipinaliwanag ng ama na dapat silang magsaya sapagkat ang anak na minsang naligaw ay muling natagpuan, at ang dating patay sa kasalanan ay muling nabuhay sa kabutihan.`;
  console.log("Begin reading for PSID:", psid);


  await sendMessage(psid, pagbasap1);
  await new Promise((r) => setTimeout(r, 2000));
  await sendMessage(psid, pagbasap2);
  await new Promise((r) => setTimeout(r, 2000));


const nabasaPayload = {
  recipient: { id: psid },
  message: {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: `☺️ Nabasa na ba ang parabula?`,
        buttons: [{ type: "postback", title: "OPO", payload: "NABASA_NA" }],
      },
    },
  },
};
//NABASA_NA


await callSendAPI(nabasaPayload);
console.log("Finished reading and sent NABASA_NA prompt for PSID:", psid);
return;
}

//pahayag bilang 1-3
async function sendPahayag(psid, number) {
  let question = "";

  console.log("sendPahayag", number, "for PSID:", psid);

  if (number === 1) {
    await sendMessage(psid, "⭐ Kung gayon. Halina’t suriin natin ang mga matatalinhagang mga pahayag mula sa parabula na pinamagatang “𝗔𝗻𝗴 𝗔𝗹𝗶𝗯𝘂𝗴𝗵𝗮𝗻𝗴 𝗔𝗻𝗮𝗸”.");
    await sendMessage(psid, "PANUTO: Tukuyin ang kahulugan ng mga matatalinhagang pahayag na 𝗻𝗮𝗸𝗮-𝗺𝗮𝗿𝗶𝗶𝗻.");
    question = "𝗣𝗔𝗛𝗔𝗬𝗔𝗚 𝗕𝗜𝗟𝗔𝗡𝗚 𝟭 - Doon ay 𝗻𝗶𝗹𝘂𝘀𝘁𝗮𝘆 𝗻𝗶𝘆𝗮 𝗮𝗻𝗴 𝘆𝗮𝗺𝗮𝗻 𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗸𝗮𝗯𝗮𝘁𝗮𝗮𝗻 sa magarbo at walang saysay na pamumuhay.";
    await sendMessage(psid, question);
    const q1Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Sinayang ang pagkakataon habang bata pa.\nB. Sinayang ang kanyang pagkatao sa kanyang buhay. ",
            buttons: [{ type: "postback", title: "A", payload: "A1" },{ type: "postback", title: "B", payload: "B1" }],
          },
        },
      },
    };
    await callSendAPI(q1Payload);
  } else if (number === 2) {
    question = "𝗣𝗔𝗛𝗔𝗬𝗔𝗚 𝗕𝗜𝗟𝗔𝗡𝗚 𝟮  - Nang maubos ang kanyang kayamanan, 𝗯𝘂𝗺𝗮𝗴𝘀𝗮𝗸 𝘀𝗶𝘆𝗮 𝘀𝗮 𝗹𝗮𝘆𝗹𝗮𝘆𝗮𝗻 𝗻𝗴 𝗸𝗮𝗵𝗶𝗿𝗮𝗽𝗮𝗻.";
    await sendMessage(psid, question);
    const q2Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Nahulog sa laylayan ng kanyang damit.\nB. Naabot ang pinakamahirap na kalagayan ng buhay.",
            buttons: [{ type: "postback", title: "A", payload: "A2" },{ type: "postback", title: "B", payload: "B2" }],
          },
        },
      },
    };
    await callSendAPI(q2Payload);
  } else if (number === 3) {
    question = "𝗣𝗔𝗛𝗔𝗬𝗔𝗚 𝗕𝗜𝗟𝗔𝗡𝗚 𝟯 - Sa gitna ng kanyang pagdurusa, 𝗻𝗮𝗴𝗹𝗶𝘄𝗮𝗻𝗮𝗴 𝗮𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗱𝗶𝘄𝗮 𝗮𝘁 𝗻𝗮𝗮𝗻𝘁𝗶𝗴 𝗮𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗽𝘂𝘀𝗼 sa pagnanais na bumalik sa kanyang ama.";
    await sendMessage(psid, question);
    const q3Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Nagising sa katotohan at nakaramdam ng awa.\nB. Nagising sa pagkabangungot at umibig sa ama.",
            buttons: [{ type: "postback", title: "A", payload: "A3" },{ type: "postback", title: "B", payload: "B3" }],
          },
        },
      },
    };
    await callSendAPI(q3Payload);
  } else if (userProgress[psid] === "PAHAYAG3_DONE") {
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, `Hindi ka lamang nagpagkita ng kahusayan sa pagsuri, ipinamalas mo rin ang iyong galing sa pagbibigay ng kahulugan sa mga matatalinhagang pahayag!`);
    await new Promise((r) => setTimeout(r, 2000));
    sendMessage(psid, `Ipinapakita sa kuwento na gaano man kalayo o kalalim ang pagkakamali ng isang tao, laging may pagkakataon para magsisi at magbagong-buhay.`);
    await new Promise((r) => setTimeout(r, 2000));
    sendMessage(psid, `Ang ama sa parabula ay sumasagisag sa Diyos na mapagpatawad at laging handang tanggapin ang kanyang mga anak na nagsisisi. Itinuturo rin nito ang kahalagahan ng kababaang-loob sa pagkilala ng sariling pagkukulang at ang pagpapatawad sa kapwa.`);
    await new Promise((r) => setTimeout(r, 2000));

    const pahayagPayload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: `Nauunawaan ba ang nabasang parabula na pinamagatang "𝗔𝗻𝗴 𝗔𝗹𝗶𝗯𝘂𝗴𝗵𝗮𝗻𝗴 𝗔𝗻𝗮𝗸"?`,
            buttons: [{ type: "postback", title: "OPO", payload: "OPO_PAHAYAG" }],
          },
        },
      },
    };
    await callSendAPI(pahayagPayload);
    delete userProgress[psid];
    console.log("Cleared userProgress after icebreaker for PSID:", psid);
    return;
  }
}


// ✅ PAGLALAHAT
async function sendPaglalahat(psid) {
  userProgress[psid] = "WAITING_OPINIONATED_ANSWER2";
  console.log("sendPaglalahat for PSID:", psid, "— state set to WAITING_OPINIONATED_ANSWER2");

  const v1 = `Bilang paglalahat…`;
  const v2 = `🤔 Ano ang katangian ng inyong magulang ang sumasalamin sa katauhan ng ama sa parabulang nabasa natin?\n\n(Paki-type ang iyong sagot.)`;

  await sendMessage(psid, v1);
  await new Promise((r) => setTimeout(r, 2000));
  await sendMessage(psid, v2);
  await new Promise((r) => setTimeout(r, 2000));
}

// ✅ HANDLE ANSWER 2
async function handleOpinionatedAnswerV2(psid) {
  console.log("handleOpinionatedAnswerV2 for PSID:", psid);
  userProgress[psid] = "AFTER_OPINIONATED_ANSWER2"; // mark done properly
  await sendPalagay(psid);
}

// ✅ PALAGAY
async function sendPalagay(psid) {
  userProgress[psid] = "WAITING_OPINIONATED_ANSWER3";
  console.log("sendPalagay for PSID:", psid, "— state set to WAITING_OPINIONATED_ANSWER3");

  const v1 = `At sa iyong palagay…`;
  const v2 = `🤔 Paano nyo pinahahalagahan ang pagmamahal at pag-aaruga ng inyong mga magulang?\n\n(Paki-type ang iyong sagot.)`;

  await sendMessage(psid, v1);
  await new Promise((r) => setTimeout(r, 2000));
  await sendMessage(psid, v2);
  await new Promise((r) => setTimeout(r, 2000));
}

// ✅ HANDLE ANSWER 3
async function handleOpinionatedAnswerV3(psid) {
  userProgress[psid] = "AFTER_OPINIONATED_ANSWER3";
  console.log("handleOpinionatedAnswerV3 for PSID:", psid, "— state set to AFTER_OPINIONATED_ANSWER3");

  const msg1 = `🥰 Ayan! Salamat sa aktibong pakikibahagi sa tinalakay na aralin.`;
  const msg2 = `Para sa huling gawain, dumako na tayo sa ating pagtataya upang malaman natin kung talagang may natutuhan kayo!`;

  await sendMessage(psid, msg1);
  await new Promise((r) => setTimeout(r, 2000));
  await sendMessage(psid, msg2);
  await new Promise((r) => setTimeout(r, 2000));

  await sendPagtataya(psid, 1);
}

//PAGTATAYA
async function sendPagtataya(psid, number) {
  let question = "";

  console.log("sendPagtataya", number, "for PSID:", psid);

  if (number === 1) {
    await sendMessage(psid, "𝗣𝗮𝗻𝘂𝘁𝗼: Piliin ang 𝗧𝗜𝗧𝗜𝗞 ng tamang sagot. Basahin nang mabuti ang tanong at piliin ang wastong sagot.");
    question = "𝟭. Ang mga parabula ay nababasa partikular sa bagong tipan ng bibliya ito matatagpuan na naglalaman ng moral at espiritwal na aspekto ng buhay.";
    await sendMessage(psid, question);
    const pagtataya1Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. TAMA\nB. MALI\nC. Both A & B",
            buttons: [
              { type: "postback", title: "A", payload: "P_A1" },
              { type: "postback", title: "B", payload: "P_B1" },
              { type: "postback", title: "C", payload: "P_C1" }],
          },
        },
      },
    };
    await callSendAPI(pagtataya1Payload);
  } else if (number === 2) {
    question = "𝟮. Ang parabula ay isang uri ng maikling kuwento na nagtuturo ng ______?";
    await sendMessage(psid, question);
    const pagtataya2Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Aral sa moral at espiritwal na aspeto ng buhay\nB. Nagtuturo ng mga maling adikhain\nC. Nagpapakita ng mga kwento na ang pangunahing tauhan ay hayop",
            buttons: [
              { type: "postback", title: "A", payload: "P_A2" },
              { type: "postback", title: "B", payload: "P_B2" },
              { type: "postback", title: "C", payload: "P_C2" }],
          },
        },
      },
    };
    await callSendAPI(pagtataya2Payload);
  } else if (number === 3) {
    question = "𝟯. 𝗡𝗶𝗹𝘂𝘀𝘁𝗮𝘆 ng anak ang kanyang pera sa maling paraan. Ano ang ibig-sabihin ng matalinhagang salitang naka-mariin?";
    await sendMessage(psid, question);
    const pagtataya3Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Tinipid\nB. Tinabi\nC. Ginastos",
            buttons: [
              { type: "postback", title: "A", payload: "P_A3" },
              { type: "postback", title: "B", payload: "P_B3" },
              { type: "postback", title: "C", payload: "P_C3" }],
          },
        },
      },
    };
    await callSendAPI(pagtataya3Payload);
  } else if (number === 4) {
    question = "𝟰. 𝗡𝗮𝗴𝗹𝗶𝘄𝗮𝗻𝗮𝗴 𝗮𝗻𝗴 𝗸𝗮𝗻𝘆𝗮𝗻𝗴 𝗱𝗶𝘄𝗮 at naantig ang kanyang puso sa pagnanais na bumalik sa kanyang ama. Ano ang ibig-sabihin ng pahayag na nagliwanag ang kanyang diwa?";
    await sendMessage(psid, question);
    const pagtataya4Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Umilaw ang kanyang kaluluwa\nB. Nagising sa katotohanan\nC. Bumalik sa pinagmulan",
            buttons: [
              { type: "postback", title: "A", payload: "P_A4" },
              { type: "postback", title: "B", payload: "P_B4" },
              { type: "postback", title: "C", payload: "P_C4" }],
          },
        },
      },
    };
    await callSendAPI(pagtataya4Payload);
  } else if (number === 5) {
    question = "𝟱. \"Ipinaliwanag ng ama na dapat silang magsaya sapagkat ang anak na 𝗺𝗶𝗻𝘀𝗮𝗻𝗴 𝗻𝗮𝗹𝗶𝗴𝗮𝘄 𝗮𝘆 𝗺𝘂𝗹𝗶𝗻𝗴 𝗻𝗮𝘁𝗮𝗴𝗽𝘂𝗮𝗻, at ang dating patay sa kasalanan ay muling nabuhay sa kabutihan\". Ayon sa pahayag na iyong binasa, ang salitang matalinhagang naka-mariin ay nagpapahayag na ang anak ay?";
    await sendMessage(psid, question);
    const pagtataya5Payload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "A. Namatay sa paggastos ng pera\nB. Nagbagong buhay at tinuwid ang sarili\nC. Namatay ngunit muling nabuhay",
            buttons: [
              { type: "postback", title: "A", payload: "P_A5" },
              { type: "postback", title: "B", payload: "P_B5" },
              { type: "postback", title: "C", payload: "P_C5" }],
          },
        },
      },
    };
    // userProgress[psid] = "PAGTATAYA5_DONE";
    await callSendAPI(pagtataya5Payload);
  } else if (userProgress[psid] === "PAGTATAYA_DONE") {
    await new Promise((r) => setTimeout(r, 2000));
    sendMessage(psid, `Mahusay! Ipagpatuloy pa ang iyong pagiging tahas!`);
    await new Promise((r) => setTimeout(r, 2000));

    const pagtatayaPayload = {
      recipient: { id: psid },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: `✅ Nauunawaan ba ang ating aralin?`,
            buttons: [{ type: "postback", title: "OPO", payload: "OPO_PAGTATAYA" }],
          },
        },
      },
    };
    await callSendAPI(pagtatayaPayload);
    delete userProgress[psid];
    console.log("Cleared userProgress after pagtataya for PSID:", psid);
    return;
  }
}


async function sendPaalam(psid) {
  userProgress[psid] = "PAALAM_SENT";
  const paalamMsg = `Ayan! Maraming salamat sa pakikibaka sa ating talakayan ngayong araw! Nawa’y mayroon kang natutuhan sa aralin ngayon! 🥰`;
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
    await new Promise((r) => setTimeout(r, 2000));
    await sendQuestion(psid, 2);
  } else if (current === 2 && answer === "gastador") {
    await sendMessage(psid, "✅ Tumpak! Ang tamang sagot ay 𝗚𝗔𝗦𝗧𝗔𝗗𝗢𝗥.");
    userProgress[psid] = 3;
    await new Promise((r) => setTimeout(r, 2000));
    await sendQuestion(psid, 3);
  } else if (current === 3 && answer === "makasalanan") {
    await sendMessage(psid, "✅ Tumpak! Ang tamang sagot ay 𝗠𝗔𝗞𝗔𝗦𝗔𝗟𝗔𝗡𝗔𝗡.");
    userProgress[psid] = "ICEBREAKER_DONE";
    await new Promise((r) => setTimeout(r, 2000));
    await sendQuestion(psid, 4);
  } else {
    console.log("handleUserAnswer: unexpected or incorrect answer for PSID:", psid);
  }
}

// Handle "Pahayag" button responses (A1–B3)
async function handlePahayagResponse(payload, psid) {
  switch (payload) {
    case "A1":
      await sendMessage(psid, "Mahusay!");
      userProgress[psid] = 2;
      await new Promise(r => setTimeout(r, 2000));
      await sendPahayag(psid, 2);
      break;

    case "B1":
      await sendMessage(psid, "Balikan ang pahayag at basahin itong muli.");
      break;

    case "A2":
      await sendMessage(psid, "Balikan ang pahayag at basahin itong muli.");
      break;

    case "B2":
      await sendMessage(psid, "Mahusay!");
      userProgress[psid] = 3;
      await new Promise(r => setTimeout(r, 2000));
      await sendPahayag(psid, 3);
      break;

    case "A3":
      await sendMessage(psid, "Mahusay!");
      userProgress[psid] = "PAHAYAG3_DONE";
      await new Promise(r => setTimeout(r, 2000));
      await sendPahayag(psid, 4);

      delete userProgress[psid];
      console.log("Cleared userProgress after completing all pahayag for PSID:", psid);
      break;

    case "B3":
      await sendMessage(psid, "Balikan ang pahayag at basahin itong muli.");
      break;

    default:
      console.log("⚠️ Unhandled pahayag payload:", payload);
  }
}

// PAGTATAYA HANDLER (FIXED VERSION)
async function handlePAGTATAYA(psid, userMessage) {
  const progress = userProgress[psid];
  if (!progress || progress.mode !== "PAGTATAYA") return;

  const current = progress.current;

  // Extract answer letter (A/B/C) from payload like "P_A1"
  const match = userMessage.match(/^P_([A-C])(\d)$/);
  if (!match) {
    console.log("⚠️ Invalid pagtataya payload:", userMessage);
    return;
  }

  const answer = match[1];

  // Correct answers
  const correctAnswers = {
    1: "A",
    2: "A",
    3: "C",
    4: "B",
    5: "B",
  };

  // Store user's answer and check if correct
  if (answer === correctAnswers[current]) {
    progress.score = (progress.score || 0) + 1;
  }

  // Move to next question if not done
  if (current < 5) {
    progress.current = current + 1;
    await new Promise((r) => setTimeout(r, 2000));
    await sendPagtataya(psid, progress.current);
  } else {
    // Show final results only after the last question
    const score = progress.score || 0;
    await new Promise((r) => setTimeout(r, 2000));
    await sendMessage(psid, `Kabuuang Marka: ${score}/5`);
    userProgress[psid] = "PAGTATAYA_DONE";

    await new Promise((r) => setTimeout(r, 2000));

    // ✅ Conditional message depending on score
    if (score >= 4) {
      await sendMessage(psid, "Mahusay! Talagang may natutuhan sa ating aralin.");
      const closingPayload = {
        recipient: { id: psid },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: "✅ Nauunawaan ba ang ating aralin?",
              buttons: [{ type: "postback", title: "OPO", payload: "PAALAM" }],
            },
          },
        },
      };
      await callSendAPI(closingPayload);
    } else {
      const retryPayload = {
        recipient: { id: psid },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: "Gusto mo bang bumawi sa pagsagot?",
              buttons: [
                { type: "postback", title: "OPO", payload: "RETRY_PAGTATAYA" },
                { type: "postback", title: "HINDI", payload: "PAALAM" },
              ],
            },
          },
        },
      };
      await callSendAPI(retryPayload);
    }
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
