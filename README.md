# jesse-website

Jouw project voor de AI-training. Wat de agent hier bouwt, wordt live gezet op
**https://jesse.sdai.nl**.

## Hoe het werkt
- Alles in deze map draait in jouw container onder `/workspace/jesse-website`.
- Er draait automatisch een dev-server op **poort 3000** (zie `server.js`), die
  nginx doorzet naar `https://jesse.sdai.nl`.
- De **browser-IDE** staat op `https://ide-jesse.sdai.nl`.

## Starten / stoppen van de server
De container start de server automatisch. Wil je hem zelf draaien:

```bash
npm start            # = node server.js  (poort 3000)
```

Gebruik je een eigen framework (Vite, Next, Express, …)? Zorg dat het op
`0.0.0.0:3000` luistert, en zet zo nodig de auto-server uit met
`sudo supervisorctl stop appserver`.

## Chatbot (lokale Qwen)

De site heeft een chat-widget die verbinding maakt met jouw lokale Qwen model
via een OpenAI-compatibele endpoint. De configuratie staat in **`config.env`**:

```bash
QWEN_API_KEY=                       # leeg laten bij Ollama / LM Studio zonder auth
QWEN_BASE_URL=http://localhost:11434/v1   # Ollama · vLLM: http://localhost:8000/v1
QWEN_MODEL=qwen2.5:7b               # bijv. qwen2.5:7b of Qwen/Qwen2.5-7B-Instruct
```

Na het aanpassen van `config.env` de server herstarten:

```bash
sudo supervisorctl restart appserver
```

Het chat endpoint is `POST /api/chat` met body
`{"messages":[{"role":"user","content":"…"}]}`.

## Je werk opslaan (git push)
De container heeft schrijfrechten op deze repo via een deploy-key:

```bash
git add -A
git commit -m "beschrijf je wijziging"
git push
```

Repo: `git@github.com:sayfjawad/jesse-website.git`
