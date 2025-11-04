// background.js

// --- Alarm/interval constants ---
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds

// --- Helper: promisified storage access ---
const getFromStorage = (key) => new Promise(resolve =>
  chrome.storage.local.get(key, (res) => resolve(res[key]))
);
const setInStorage = (key, value) => new Promise(resolve =>
  chrome.storage.local.set({ [key]: value }, () => resolve())
);

// --- Badge helpers ---
const resetBadge = () => chrome.action.setBadgeText({ text: "" });
const addBadge = (textObj, colorObj) => {
  chrome.action.setBadgeText(textObj);
  chrome.action.setBadgeBackgroundColor(colorObj);
};

// --- Gmail token helpers ---
const getStoredGmailToken = async () => await getFromStorage("gmail_token");

const getValidGmailToken = async (interactive = false) => {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.warn("No valid token available.");
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
};

// --- Fetch latest Gmail verification code ---
async function fetchLatestGmailCode(token) {
  try {
    console.log("Fetching Gmail latest verification code...");

    if (!token) {
      console.warn("No Gmail token available.");
      return null;
    }

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

    // --- Decode Base64 message ---
    const decodeBase64Url = (str) => atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const extractText = (payload) => {
      let text = "";
      if (payload.body?.data) text += decodeBase64Url(payload.body.data);
      if (payload.parts?.length) payload.parts.forEach(p => text += extractText(p));
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

    // --- Store verification code if new ---
    const previous = await getFromStorage("verificationCodes") || {};
    if (previous.code !== code) {
      console.log("New verification code from gmail");
      const verificationCodes = {
        service,
        code,
        sentDate: new Date(msgData.internalDate * 1).toLocaleString(),
        fetchedDate: new Date().toLocaleString(),
        isShown: false,
      };
      await setInStorage("verificationCodes", verificationCodes);

      chrome.runtime.sendMessage({
        action: "verificationCodeUpdated",
        data: verificationCodes,
      });

      addBadge({ text: "NEW" }, { color: "#4caf50" });
    }

    return code;
  } catch (err) {
    console.error("Error fetching Gmail code:", err);
    return null;
  }
}

// --- Polling function ---
async function pollGmailVerificationCode() {
  let token = await getStoredGmailToken();

  if (!token) {
    // Try silent retrieval (non-interactive)
    token = await getValidGmailToken(false);
    if (!token) {
      console.warn("User not authenticated yet. Stopping polling.");
      stopGmailPolling();
      return;
    }
    await setInStorage("gmail_token", token);
  }

  await fetchLatestGmailCode(token);
}

// --- Polling control ---
function startGmailPolling() {
  chrome.alarms.clear("pollGmail", () => {
    chrome.alarms.create("pollGmail", { periodInMinutes: POLL_INTERVAL_MINUTES });
    console.log("✅ Gmail polling started");
  });
}

function stopGmailPolling() {
  chrome.alarms.clear("pollGmail", (wasCleared) => {
    if (wasCleared) console.log("✅ Gmail polling stopped");
  });
}

// --- Alarm listener ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pollGmail") {
    await pollGmailVerificationCode();
  }
});

// --- Message listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === "fetchLatestGmailCode") {
        const token = await getStoredGmailToken();
        const code = await fetchLatestGmailCode(token);
        sendResponse({ code });
      } else if (request.action === "getValidGmailToken") {
        const token = await getValidGmailToken(true);
        sendResponse({ token });
      } else if (request.action === "startGmailPolling") {
        startGmailPolling();
        sendResponse({ status: "started" });
      } else if (request.action === "stopGmailPolling") {
        stopGmailPolling();
        sendResponse({ status: "stopped" });
      } else if (request.action === "resetBadge") {
        resetBadge();
      }
    } catch (err) {
      console.error("Error in message listener:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep sendResponse async
});
