/* global chrome */
import { useState, useEffect } from "react";
import { GMAIL_LOGO, OUTLOOK_LOGO } from "./icons";

const allServices = {
  gmail: GMAIL_LOGO,
  outlook: OUTLOOK_LOGO,
};

// At the top of App.js or in a separate file
const isExtension = typeof chrome !== "undefined" && chrome.storage;

if (!isExtension) {
  window.chrome = {
    storage: {
      local: {
        get: (keys, cb) => cb({}),
        set: (items, cb) => cb?.(),
        clear: (cb) => cb?.(),
      },
    },
    runtime: {
      sendMessage: (msg, cb) => cb?.(),
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    identity: {
      getAuthToken: ({ interactive }, cb) => cb("mock_token"),
    },
  };
}


function App() {
  const startingInfoState = {
    code: "N/A",
    service: "N/A",
    sentDate: "N/A",
    fetchedDate: "N/A",
  };
  const [copied, setCopied] = useState(false);
  const [addedServices, setAddedServices] = useState({});
  const [verificationData, setVerificationData] = useState(startingInfoState);
  const [choosingServiceToAdd, setChoosingServiceToAdd] = useState(false);

  const getAddedServices = () => {
    chrome.storage.local.get(null, (res) => {
      const services = {};
      Object.keys(allServices).forEach((key) => {
        if (res[`${key}_token`]) services[key] = allServices[key];
      });
      setAddedServices(services);
      if (res.verificationCodes) setVerificationData(res.verificationCodes);
    });
  }
  // --- Load added services from storage ---
  useEffect(() => {
    // Clear badge text when popup opens
    chrome.action.setBadgeText({ text: "" });

    getAddedServices();

    const listener = (msg) => {
      if (msg.action === "verificationCodeUpdated") setVerificationData(msg.data);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(verificationData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const requestGmailCode = (token) => {
    chrome.runtime.sendMessage({ action: "fetchLatestGmailCode", token });
  };

  const handleServiceClick = (key) => {
    if (choosingServiceToAdd) {
      if (key === "gmail") {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (!token) return alert("Authentication failed");

          chrome.storage.local.set({ gmail_token: token });
          setAddedServices((prev) => ({ ...prev, gmail: GMAIL_LOGO }));
          requestGmailCode(token);
          setChoosingServiceToAdd(false);
        });
      } else {
        alert(`OAuth for ${key} not implemented`);
      }
    } else {
      if (key === "gmail") {
        chrome.storage.local.get("gmail_token", (res) => {
          const token = res.gmail_token;
          if (!token) return alert("Authentication required");
          requestGmailCode(token);
        });
      } else {
        alert(`Clicked on ${key}`);
      }
    }
  };

const revokeGmailToken = async () => {
  // Get token from storage first
  chrome.storage.local.get("gmail_token", async (res) => {
    const token = res.gmail_token;
    if (!token) return;

    // Remove cached token
    chrome.identity.removeCachedAuthToken({ token }, () => {
      console.log("Gmail token removed from cache");
    });

    // Revoke token server-side
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    console.log("Gmail OAuth revoked");

    // Remove token from storage
    chrome.storage.local.remove("gmail_token");

    // --- Stop polling by sending message to background.js ---
    chrome.runtime.sendMessage({ action: "stopGmailPolling" });

    getAddedServices();
    setVerificationData(prev=>startingInfoState);
  });
};

  return (
    <div className="w-64 bg-[#21201E] rounded-2xl shadow-2xl p-5 border-2 border-purple-600/30 relative">
      {!choosingServiceToAdd ? (
        <div className="flex flex-col items-center">
  {/* Dynamically render the service logo */}
  {(() => {
    const ServiceLogo = verificationData.service && addedServices[verificationData.service]
      ? addedServices[verificationData.service]
      : GMAIL_LOGO; // fallback
    return <ServiceLogo className="w-16 h-16 mb-2" />;
  })()}

  <p className="text-xs text-gray-400 mb-1">
    {verificationData.service || "Gmail"}
  </p>

  <div
    onClick={handleCopy}
    className="bg-[#2A2826] rounded-lg pt-4 mb-4 border border-gray-700 cursor-pointer hover:border-purple-600 transition-colors w-full"
  >
    <p className="text-3xl font-mono font-bold text-white tracking-wider text-center">
      {verificationData.code}
    </p>
    <p className="text-xs text-gray-500 mb-3 text-center">
              Sent: {verificationData.sentDate}
              {/* | Fetched: {verificationData.fetchedDate} */}
    </p>
  </div>

  <button
    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg mb-2 transition-colors text-sm"
    onClick={handleCopy}
  >
    {copied ? "✓ Copied!" : "Copy Code"}
  </button>

  <div className="flex -space-x-3 mt-2 items-center">
    {Object.entries(addedServices).map(([key, Service]) => (
      <div
        key={key}
        className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md"
      >
        <Service
          className="w-10 h-10 rounded-full hover:cursor-pointer"
          onClick={() => handleServiceClick(key)}
        />
      </div>
    ))}

    <button
      onClick={() => setChoosingServiceToAdd(true)}
      className="w-10 h-10 rounded-full border-2 border-white bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 shadow-md"
    >
      +
    </button>
  </div>
</div>

      ) : (
        <div className="flex flex-col items-center">
          <div className="text-white">Choose Service to Add</div>
          <div className="flex flex-row gap-2">
            {Object.entries(allServices).map(([key, Service]) => (
              <div
                key={key}
                className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md"
              >
                <Service
                  className="w-10 h-10 rounded-full hover:cursor-pointer"
                  onClick={() => handleServiceClick(key)}
                />
              </div>
            ))}
          </div>
          <div className="flex -space-x-3 mt-2 items-center">
            <button
              onClick={() => setChoosingServiceToAdd(false)}
              className="w-10 h-10 rounded-full border-2 border-white bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 shadow-md"
            >
              -
            </button>
          </div>
        </div>
      )}

      <button
  onClick={() => {
    revokeGmailToken();
    chrome.storage.local.clear(() => {
      console.log("✅ Extension storage cleared");
      alert("Extension storage cleared!");
    });
  }}
  className="w-32 mt-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
>
  Clear Storage & Revoke Gmail
</button>

    </div>
  );
}

export default App;
