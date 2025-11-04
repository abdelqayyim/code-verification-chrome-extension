/* global chrome */
import { useState, useEffect } from "react";
import { GMAIL_LOGO, OUTLOOK_LOGO } from "./icons";

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
    code: undefined,
    service: undefined,
    sentDate: undefined,
    fetchedDate: undefined,
    isShown: true,
  };
  const [copied, setCopied] = useState(false);
  const [addedServices, setAddedServices] = useState({});
  const [verificationData, setVerificationData] = useState(startingInfoState);
  const [choosingServiceToAdd, setChoosingServiceToAdd] = useState(false);
  
  // --- Load added services from storage ---
  useEffect(() => {
    // Clear badge text when popup opens
    chrome.runtime.sendMessage({ action: "resetBadge" });

    getAddedServices();

    const listener = (msg) => {
      if (msg.action === "verificationCodeUpdated")
        setVerificationData(msg.data);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(verificationData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Call this when user clicks "Connect Gmail"
  const allowGmailAccess = async () => {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error(
          "Gmail authentication failed:",
          chrome.runtime.lastError
        );
        resolve(null);
        return;
      }

      console.log("Gmail token obtained:", token);

      // Store token in storage
      chrome.storage.local.set({ gmail_token: token }, () => {
        console.log("Gmail token saved to storage");

        // Update addedServices state so Gmail disappears from "Add Service" view
        setAddedServices((prev) => ({
          ...prev,
          gmail: allServices.gmail,
        }));

        // Close the add-service tab if you want
        setChoosingServiceToAdd(false);

        // Start Gmail polling in background
        chrome.runtime.sendMessage({ action: "startGmailPolling" });

        resolve(token);
      });
    });
  });
};

  const getLatesGmailCode = () => {
    chrome.runtime.sendMessage(
      { action: "fetchLatestGmailCode" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
        } else {
          console.log("Background responded with code:", response?.code);
        }
      }
    );
  };
  const revokeGmailToken = async () => {
  // Get token from storage
  chrome.storage.local.get("gmail_token", async (res) => {
    const token = res.gmail_token;
    if (!token) return;

    // Remove cached token
    chrome.identity.removeCachedAuthToken({ token }, () => {
      console.log("Gmail token removed from cache");
    });

    // Revoke token server-side
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
      console.log("Gmail OAuth revoked");
    } catch (err) {
      console.error("Failed to revoke Gmail token:", err);
    }

    // Remove Gmail token AND verificationCodes from storage
    chrome.storage.local.remove(["gmail_token", "verificationCodes"], () => {
      console.log("Gmail token and verificationCodes removed from storage");

      // Reset local state
      setVerificationData({
        code: undefined,
        service: undefined,
        sentDate: undefined,
        fetchedDate: undefined,
        isShown: true,
      });

      // Update added services after removal
      getAddedServices();

      // Stop any background polling
      chrome.runtime.sendMessage({ action: "stopGmailPolling" });
    });
  });
};


  const allServices = {
    gmail: {
      logo: GMAIL_LOGO,
      cancel: () => revokeGmailToken(),
      allowAccess: () => allowGmailAccess(),
      getLatest: () => getLatesGmailCode(),
    },
    outlook: {
      logo: OUTLOOK_LOGO,
      cancel: () => {
        console.log("cancel outlook service");
      },
      allowAccess: () => {},
      getLatest: () => {},
    },
  };

  const getAddedServices = () => {
    chrome.storage.local.get(null, (res) => {
      const services = {};
      Object.keys(allServices).forEach((key) => {
        if (res[`${key}_token`]) services[key] = allServices[key];
      });
      setAddedServices(services);
      if (res.verificationCodes) setVerificationData(res.verificationCodes);
    });
  };

  return (
    <div className="w-64 bg-[#21201E] shadow-2xl p-5 border-2 border-transparent relative">
      {/* Animation container */}
      <div className="relative w-full overflow-y-hidden transition-all duration-500 ease-in-out">
        {/* === DEFAULT VIEW === */}
        <div
          className={`transition-transform duration-500 ease-in-out ${
            choosingServiceToAdd
              ? "-translate-y-full opacity-0 absolute inset-0"
              : "translate-y-0 opacity-100 relative"
          }`}
        >
          <div className="flex flex-col items-center">
            {verificationData.service ? (
              <div className="flex flex-col items-center w-full">
                {addedServices[verificationData.service] &&
                  (() => {
                    const ServiceLogo =
                      addedServices[verificationData.service].logo;
                    return <ServiceLogo className="w-16 h-16 mb-2" />;
                  })()}

                <p className="text-xs text-gray-400 mb-1">
                  {verificationData.service}
                </p>

                <div
                  onClick={handleCopy}
                  className="bg-[#2A2826] rounded-lg pt-4 mb-4 border border-gray-700 cursor-pointer hover:border-purple-600 transition-colors w-full"
                >
                  <p className="text-3xl font-mono font-bold text-white tracking-wider text-center">
                    {verificationData.code}
                  </p>
                  <p className="text-xs text-gray-500 mb-3 text-center">
                    {`Sent: ${verificationData.sentDate}`}
                  </p>
                </div>

                <button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg mb-2 transition-colors text-sm"
                  onClick={handleCopy}
                >
                  {copied ? "✓ Copied!" : "Copy Code"}
                </button>
              </div>
            ) : (
              <div className="text-white text-center text-lg mb-4">
                Add a mailing service
              </div>
            )}

            {/* Add service button */}
            <div className="flex mt-2 items-center gap-2">
              {Object.entries(addedServices).map(([key, Service]) => (
                <div key={key} className="relative group">
                  {/* Delete bin (outside the circle) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      Service.cancel();
                    }}
                    className="absolute -top-2 -left-2 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                  >
                    🗑️
                  </button>

                  {/* Service logo circle */}
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
                    <Service.logo
                      className="w-10 h-10 rounded-full hover:cursor-pointer"
                      onClick={() => Service.getLatest()}
                    />
                  </div>
                </div>
              ))}

              {/* Add (+) button */}
              <button
                onClick={() => setChoosingServiceToAdd(true)}
                className="w-10 h-10 rounded-full border-2 border-white bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 shadow-md"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* === CHOOSE SERVICE VIEW === */}
        <div
          className={`transition-transform duration-500 ease-in-out ${
            choosingServiceToAdd
              ? "translate-y-0 opacity-100 relative"
              : "translate-y-full opacity-0 absolute inset-0"
          }`}
        >
          <div className="flex flex-col items-center">
            <div className="text-white text-center text-lg mb-4 ">
              Choose Service to Add
            </div>
            <div className="flex flex-row gap-2 mt-2 flex-wrap justify-center">
              {Object.entries(allServices)
                .filter(([key]) => !addedServices[key])
                .map(([key, Service]) => (
                  <div
                    key={key}
                    className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md"
                  >
                    <Service.logo
                      className="w-10 h-10 rounded-full hover:cursor-pointer"
                      onClick={() => Service.allowAccess()}
                    />
                  </div>
                ))}
            </div>
            <button
              onClick={() => setChoosingServiceToAdd(false)}
              className="w-10 h-10 mt-3 rounded-full border-2 border-white bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 shadow-md"
            >
              -
            </button>
          </div>
        </div>
      </div>

      {/* === Bottom clear button === */}
      <button
        onClick={() => {
          revokeGmailToken();
          chrome.storage.local.clear(() => {
            console.log("✅ Extension storage cleared");
            alert("Extension storage cleared!");
          });
        }}
        className="w-32 mt-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
      >
        Clear Storage & Revoke Gmail
      </button>
    </div>
  );
}
export default App;
