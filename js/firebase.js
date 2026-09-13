(function () {
  "use strict";

  const SDK_VERSION = "12.19.0";
  const firebaseConfig = {
    apiKey: "AIzaSyA7anIekcJIAVrqjLLJwtlfw3tc7nkNs4I",
    authDomain: "formfantaasta.firebaseapp.com",
    databaseURL: "https://formfantaasta-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "formfantaasta",
    storageBucket: "formfantaasta.firebasestorage.app",
    messagingSenderId: "475377910531",
    appId: "1:475377910531:web:04872f1681384240ae5f36",
    measurementId: "G-TD3HDR5KH0"
  };

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function friendlyError(error) {
    const code = error && error.code ? error.code : "";
    if (code.includes("operation-not-allowed")) {
      return new Error("Attiva l'accesso anonimo in Firebase Authentication.");
    }
    if (code.includes("unauthorized-domain")) {
      return new Error("Aggiungi formfantaasta.formatiks.com ai domini autorizzati di Firebase Authentication.");
    }
    if (code.includes("permission-denied")) {
      return new Error("Pubblica le regole di Realtime Database prima di usare le stanze online.");
    }
    if (code.includes("network-request-failed")) {
      return new Error("Connessione a Firebase non disponibile. Controlla Internet e riprova.");
    }
    return error instanceof Error ? error : new Error("Firebase non disponibile.");
  }

  window.FantastaFirebaseReady = (async function () {
    try {
      const baseUrl = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
      const [appSdk, authSdk, databaseSdk] = await Promise.all([
        import(`${baseUrl}/firebase-app.js`),
        import(`${baseUrl}/firebase-auth.js`),
        import(`${baseUrl}/firebase-database.js`)
      ]);

      const app = appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) {
        await authSdk.signInAnonymously(auth);
      }

      const database = databaseSdk.getDatabase(app);
      let serverTimeOffset = 0;
      databaseSdk.onValue(databaseSdk.ref(database, ".info/serverTimeOffset"), function (snapshot) {
        serverTimeOffset = Number(snapshot.val()) || 0;
      });

      function getRoomReference(code) {
        return databaseSdk.ref(database, `rooms/${code}`);
      }

      return {
        enabled: true,
        uid: auth.currentUser.uid,
        now: function () {
          return Date.now() + serverTimeOffset;
        },
        getRoom: async function (code) {
          try {
            const snapshot = await databaseSdk.get(getRoomReference(code));
            return snapshot.exists() ? clone(snapshot.val()) : null;
          } catch (error) {
            throw friendlyError(error);
          }
        },
        createRoom: async function (room) {
          try {
            const result = await databaseSdk.runTransaction(
              getRoomReference(room.code),
              function (currentRoom) {
                return currentRoom === null ? clone(room) : undefined;
              },
              { applyLocally: false }
            );
            return result.committed ? clone(result.snapshot.val()) : null;
          } catch (error) {
            throw friendlyError(error);
          }
        },
        updateRoom: async function (code, updater) {
          let operationError = null;
          try {
            const result = await databaseSdk.runTransaction(
              getRoomReference(code),
              function (currentRoom) {
                operationError = null;
                if (currentRoom === null) {
                  operationError = new Error("La stanza non esiste più.");
                  return undefined;
                }

                try {
                  const updatedRoom = updater(clone(currentRoom));
                  return updatedRoom === undefined ? clone(currentRoom) : clone(updatedRoom);
                } catch (error) {
                  operationError = error;
                  return undefined;
                }
              },
              { applyLocally: false }
            );

            if (operationError) throw operationError;
            if (!result.committed) throw new Error("Aggiornamento della stanza annullato.");
            return clone(result.snapshot.val());
          } catch (error) {
            throw friendlyError(error);
          }
        },
        listenRoom: function (code, onRoom, onError) {
          return databaseSdk.onValue(
            getRoomReference(code),
            function (snapshot) {
              onRoom(snapshot.exists() ? clone(snapshot.val()) : null);
            },
            function (error) {
              if (onError) onError(friendlyError(error));
            }
          );
        }
      };
    } catch (error) {
      const friendly = friendlyError(error);
      console.error("Firebase non inizializzato", friendly);
      return { enabled: false, error: friendly };
    }
  })();
})();
