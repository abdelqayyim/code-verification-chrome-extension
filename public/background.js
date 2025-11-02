// background.js
let gmailPollingIntervalId = null;
// --- Helper: Fetch verification code from Gmail ---
async function fetchLatestGmailCode() {
  try {
    console.log("fetching gmail latest");
    // --- Get stored token ---
    let { gmail_token: token } = await chrome.storage.local.get("gmail_token");
    
    // --- Get new token if missing ---
    if (!token) {
      console.log("No stored Gmail token, requesting new one...");
      token = await getValidGmailToken(); // make sure this returns a token or null
      if (!token) {
        console.warn("User not authenticated yet — stopping fetch.");
        return null;
      }
      await chrome.storage.local.set({ gmail_token: token });
    }

    console.log("Using Gmail token:", token);

    // --- Fetch messages ---
    const searchQuery = encodeURIComponent("verification code");
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      console.log("No messages found with 'verification code'", data);
      return null;
    }

    const msgId = data.messages[0].id;
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const msgData = await msgRes.json();

    // --- Decode message ---
    const decodeBase64Url = (str) =>
      atob(str.replace(/-/g, "+").replace(/_/g, "/"));

    const extractText = (payload) => {
      let text = "";
      if (payload.body?.data) text += decodeBase64Url(payload.body.data);
      if (payload.parts?.length) {
        for (const part of payload.parts) {
          text += extractText(part);
        }
      }
      return text;
    };

    let messageText = msgData.snippet || "";
    messageText += extractText(msgData.payload);

    const match = messageText.match(/\b\d{4,8}\b/);
    if (!match) {
      console.warn("No verification code found in message text.");
      return null;
    }

    const code = match[0];
    const service = "gmail";

    // --- Save if new code ---
    const storedData = await chrome.storage.local.get("verificationCodes");
    const previous = storedData.verificationCodes || {};
    if (previous.code !== code) {
      const verificationCodes = {
        service,
        code,
        sentDate: new Date(msgData.internalDate * 1).toLocaleString(),
        fetchedDate: new Date().toLocaleString(),
        isShown: false,
      };
      await chrome.storage.local.set({ verificationCodes });

      // Notify popup / update badge / notifications
      chrome.runtime.sendMessage({
        action: "verificationCodeUpdated",
        data: verificationCodes,
      });
      chrome.action.setBadgeText({ text: "NEW" });
      chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
    } else {
      console.log("Code unchanged, skipping update.");
    }

    return code;
  } catch (err) {
    console.error("Error fetching Gmail code:", err);
    return null;
  }
}



// --- Helper: Get or refresh Gmail token ---
async function getValidGmailToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.warn("No valid token available, user interaction required.");
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

// --- Polling function ---
async function pollGmailVerificationCode() {
  const { gmail_token: storedToken } =
    await chrome.storage.local.get("gmail_token");

  let token = storedToken;

  if (!token) {
    console.log("No stored Gmail token, trying to get a new one...");
    token = await getValidGmailToken();
    if (token) {
      await chrome.storage.local.set({ gmail_token: token });
    } else {
      console.warn("User not authenticated yet — Stopping polling Until Authenticated.");
      stopGmailPolling();
      return;
    }
  }

  await fetchLatestGmailCode();
}

// // --- 🔄 Run polling every 30 seconds ---
// (async () => {
//   await pollGmailVerificationCode();
//   startGmailPolling(); // start repeating every 30s
// })();

// Create an alarm to fire every minute
chrome.alarms.create("pollGmail", { periodInMinutes: 0.5 });
// Respond to alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pollGmail") {
    await pollGmailVerificationCode();
  }
});


function startGmailPolling() {
  // Stop any previous polling if it exists
  stopGmailPolling();

  gmailPollingIntervalId = setInterval(pollGmailVerificationCode, 30 * 1000);
}

// Stop polling function
function stopGmailPolling() {
  if (gmailPollingIntervalId) {
    clearInterval(gmailPollingIntervalId);
    gmailPollingIntervalId = null;
    console.log("✅ Gmail polling stopped");
  }
}

// --- 🚀 Run immediately on startup ---
chrome.runtime.onStartup.addListener(pollGmailVerificationCode);

(async () => {
  await pollGmailVerificationCode();
})();

// --- Listen for popup messages ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === "fetchLatestGmailCode") {
        const code = await fetchLatestGmailCode();
        sendResponse({ code });
      } else if (request.action === "getValidGmailToken") {
        const token = await getValidGmailToken();
        sendResponse({ token });
      } else if (request.action === "showCodeOverlay" && sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "displayCode",
          code: request.code,
        });
      }
    } catch (err) {
      console.error("Error in message listener:", err);
      sendResponse({ error: err.message });
    }
  })();
  return true; // tell Chrome we will respond asynchronously
});
