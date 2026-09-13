# Attivazione Firebase

## 1. Configura Authentication

Nel progetto `formfantaasta`, apri **Firebase Console > Authentication**:

1. In **Sign-in method**, verifica che **Anonimo** sia abilitato.
2. In **Settings > Authorized domains**, aggiungi `formfantaasta.formatiks.com` se non è già presente.

## 2. Pubblica le regole Database

Il metodo più rapido è aprire **Firebase Console > Realtime Database > Rules**, incollare il contenuto di `database.rules.json` e premere **Publish**.

In alternativa, dopo aver installato Node.js 20 o superiore, apri PowerShell nella cartella del progetto ed esegui:


```powershell
npx firebase-tools login
npx firebase-tools deploy --only database
```

## 3. Pubblica il sito

Il dominio già configurato è:

```text
https://formfantaasta.formatiks.com
```

Pubblica su quel dominio i file aggiornati del progetto con il sistema già collegato al `CNAME`. Se vuoi usare anche Firebase Hosting, esegui:

```powershell
npx firebase-tools deploy --only hosting
```

Apri `https://formfantaasta.formatiks.com` su entrambi i dispositivi. Il primo crea la stanza, il secondo inserisce il codice e tutte le offerte vengono sincronizzate in tempo reale.

## Sviluppo locale

Per provare l'interfaccia dal computer prima del deploy:

```powershell
python -m http.server 8000
```

Poi apri `http://localhost:8000`. Per collegare un telefono è comunque consigliato usare l'indirizzo Firebase Hosting.
