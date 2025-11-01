// background.js
let gmailPollingIntervalId = null;
// --- Helper: Fetch verification code from Gmail ---
async function fetchLatestGmailCode(token) {
  try {
    const searchQuery = encodeURIComponent("verification code");
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!data.messages || data.messages.length === 0) {
      console.log("No messages found with 'verification code'");
      return null;
    }

    const msgId = data.messages[0].id;
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const msgData = await msgRes.json();

    // --- Decode message body ---
    const decodeBase64Url = (str) => {
      try {
        return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      } catch (e) {
        console.error("Base64 decode failed:", e);
        return "";
      }
    };

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
      console.warn("⚠️ No verification code found in message text.");
      return null;
    }

    const code = match[0];
    const service = "gmail";

    // --- Parse date info ---
    const dateHeader = msgData.payload.headers.find(
      (h) => h.name.toLowerCase() === "date"
    );
    const sentDateObj = dateHeader ? new Date(dateHeader.value) : new Date();
    const formattedSentDate = sentDateObj.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const fetchedDate = new Date().toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // --- Compare with existing stored code ---
    const storedData = await chrome.storage.local.get("verificationCodes");
    const previous = storedData.verificationCodes || {};
    if (previous.code === code) {
      console.log("No change in code, skipping update.");
      return code;
    }

    // --- Save new code ---
    const verificationCodes = { service, code, sentDate: formattedSentDate, fetchedDate };
    await chrome.storage.local.set({ verificationCodes });

    // --- Notify popup (if open) ---
    chrome.runtime.sendMessage({
      action: "verificationCodeUpdated",
      data: verificationCodes,
    });

    // --- Always show badge (even if notifications blocked) ---
    chrome.action.setBadgeText({ text: "NEW" });
    chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });

    // --- Check notification permission ---
    chrome.notifications.getPermissionLevel((level) => {
      if (level === "granted") {
        const options = {
          type: "basic",
          iconUrl: "icon16.png",
          title: `New ${service} verification code`,
          message: `Code: ${code}\nSent: ${formattedSentDate}`,
          priority: 2,
          buttons: [{ title: "Copy Code" }],
        };

        chrome.notifications.create(options, (notificationId) => {
          // --- Copy button handler ---
          const handleButtonClick = (id, buttonIndex) => {
            if (id === notificationId && buttonIndex === 0) {
              chrome.runtime.sendMessage({ action: "copyCode", code });
              chrome.notifications.clear(notificationId);
              chrome.notifications.onButtonClicked.removeListener(handleButtonClick);
            }
          };
          chrome.notifications.onButtonClicked.addListener(handleButtonClick);

          // --- Open popup when notification clicked ---
          const handleClick = (id) => {
            if (id === notificationId) {
              chrome.action.openPopup();
              chrome.notifications.clear(notificationId);
              chrome.notifications.onClicked.removeListener(handleClick);
            }
          };
          chrome.notifications.onClicked.addListener(handleClick);
        });
      } else if (level === "denied") {
        console.warn("Notifications are blocked by system settings ❌");
        chrome.action.setBadgeText({ text: "OFF" });
        chrome.action.setBadgeBackgroundColor({ color: "#ff0000" });
      } else {
        console.log("Notification permission is default — not yet granted or denied.");
      }
    });

    console.log("✅ Gmail code updated and badge/notification sent:", code);
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

  await fetchLatestGmailCode(token);
}

// --- 🔄 Run polling every 30 seconds ---
(async () => {
  await pollGmailVerificationCode();
  startGmailPolling(); // start repeating every 30s
})();

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
    if (request.action === "getValidGmailToken") {
      const token = await getValidGmailToken();
      sendResponse({ token });
    } else if (request.action === "fetchLatestGmailCode") {
      const { token } = request;
      const code = await fetchLatestGmailCode(token);
      sendResponse({ code });
    }
  })();
  return true;
});



chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "showCodeOverlay" && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "displayCode",
      code: msg.code,
    });
  }
});