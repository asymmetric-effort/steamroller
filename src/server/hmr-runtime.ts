/**
 * @module server/hmr-runtime
 * @description HMR client code that gets injected into dev builds.
 * This is a string template of JavaScript that runs in the browser.
 */

/**
 * Generate the HMR client runtime code to be injected into the page.
 *
 * @param wsPort - WebSocket server port
 * @param wsHost - WebSocket server host
 * @returns JavaScript source code string for the HMR client
 */
export const generateHmrRuntime = (
  wsPort: number,
  wsHost: string = "localhost",
): string => {
  return `
(function() {
  // HMR Runtime - steamroller dev server
  const socket = new WebSocket("ws://${wsHost}:" + ${JSON.stringify(wsPort)} + "/__hmr");
  const registry = new Map();
  let isConnected = false;

  socket.addEventListener("open", function() {
    isConnected = true;
    console.log("[steamroller] HMR connected");
  });

  socket.addEventListener("close", function() {
    if (isConnected) {
      console.log("[steamroller] HMR disconnected, attempting reload...");
      isConnected = false;
      setTimeout(function() { location.reload(); }, 1000);
    }
  });

  socket.addEventListener("message", function(event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    if (msg.type === "update") {
      handleUpdate(msg);
    } else if (msg.type === "full-reload") {
      console.log("[steamroller] Full reload");
      location.reload();
    } else if (msg.type === "css-update") {
      handleCssUpdate(msg);
    } else if (msg.type === "connected") {
      console.log("[steamroller] Connected to HMR server");
    }
  });

  function handleCssUpdate(msg) {
    var links = document.querySelectorAll("link[rel=stylesheet]");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute("href");
      if (href && (href.indexOf(msg.path) !== -1 || msg.path === "*")) {
        var newLink = link.cloneNode();
        var timestamp = "?t=" + Date.now();
        newLink.href = href.split("?")[0] + timestamp;
        link.parentNode.insertBefore(newLink, link.nextSibling);
        link.parentNode.removeChild(link);
        console.log("[steamroller] CSS updated: " + msg.path);
      }
    }
  }

  function handleUpdate(msg) {
    var id = msg.path;
    var entry = registry.get(id);
    if (entry && entry.callbacks.length > 0) {
      // Dispose old module
      if (entry.disposeCallbacks.length > 0) {
        for (var i = 0; i < entry.disposeCallbacks.length; i++) {
          entry.disposeCallbacks[i](entry.data);
        }
      }
      // Accept update
      for (var j = 0; j < entry.callbacks.length; j++) {
        entry.callbacks[j]();
      }
      console.log("[steamroller] HMR update: " + id);
    } else {
      console.log("[steamroller] No HMR handler for " + id + ", reloading");
      location.reload();
    }
  }

  // import.meta.hot API
  function createHotContext(ownerPath) {
    if (!registry.has(ownerPath)) {
      registry.set(ownerPath, {
        callbacks: [],
        disposeCallbacks: [],
        data: {},
        isAccepted: false,
        isInvalidated: false
      });
    }
    var entry = registry.get(ownerPath);

    return {
      get data() {
        return entry.data;
      },
      accept: function(cb) {
        entry.isAccepted = true;
        if (typeof cb === "function") {
          entry.callbacks.push(cb);
        }
      },
      dispose: function(cb) {
        if (typeof cb === "function") {
          entry.disposeCallbacks.push(cb);
        }
      },
      invalidate: function() {
        entry.isInvalidated = true;
        socket.send(JSON.stringify({ type: "invalidate", path: ownerPath }));
      }
    };
  }

  // Expose the hot context factory globally
  if (typeof globalThis !== "undefined") {
    globalThis.__steamroller_hot = createHotContext;
  }
})();
`.trim();
};
