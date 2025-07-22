[![Live Demo](https://img.shields.io/badge/Live%20Demo-chiara.help-blue?style=for-the-badge)](https://chiara.help)

# Chiara: the study tutor for everyone

<img src="public/images/fav.png" alt="Chiara Logo" width="100"/>

> **Adaptive learning that fits how you think. Personalized tools to organize, study, and grow—because great ideas can come from anyone, anywhere.**

---

## 🚀 Overview

Chiara is an open-source, AI-powered study companion and document assistant designed to make advanced learning tools accessible to everyone. From the very beginning, Chiara was built with direct input from students—including those with learning difficulties and disabilities—to ensure that its features are truly inclusive, flexible, and supportive of diverse learning needs. Whether you’re looking for personalized study aids, accessible document engagement, or just a smarter way to organize your materials, Chiara is here to help you learn your way.

👉 **Try it now: [chiara.help](https://chiara.help)**

---

## ✨ Features

- **Interactive AI Tutor**: Chat with an AI that answers questions about your uploaded materials, with source citations and tailored explanations.
- **Document Q&A**: Ask questions about your PDFs, notes, and audio files. The AI can reference specific pages and content.
- **Automatic Lecture Transcription**: Upload audio lectures and get instant, accurate transcripts.
- **Flashcard, Mindmap, and Quiz Generation**: Instantly create study aids from your documents.
- **Text-to-Speech**: Listen to your documents with on-demand audio generation and playback controls.
- **Contextual Notes & Artifacts**: Take notes and create highlights directly linked to your study materials.
- **Course & File Organization**: Group files by course, search, preview, and manage all your study resources in one place.
- **Multi-language Support**: English and Italian UI (with i18n support).

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite, TailwindCSS, Lucide icons, i18n)
- **Backend**: Firebase Functions (Node.js, ES Modules), Firestore, Firebase Storage, Pub/Sub, App Check
- **AI Integrations**: OpenAI, Gemini, Mistral, DeepInfra, and more
- **Hosting**: Firebase Hosting

---

## 🏗️ Project Structure

```
Chiara/
  ├── src/                # Frontend React app
  ├── functions/          # Firebase Cloud Functions (Node.js)
  ├── public/             # Static assets, legal, and translation files
  ├── firestore.rules     # Firestore security rules
  ├── storage.rules       # Storage security rules
  ├── firebase.json       # Firebase project config
  └── ...
```

---

## ⚡ Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/cver-me/chiara-free.git
cd chiara-free
```

### 2. Install Dependencies

- **Frontend:**
  ```bash
  npm install
  ```
- **Backend (Cloud Functions):**
  ```bash
  cd functions
  npm install
  cd ..
  ```

### 3. Environment Variables

- **Frontend:**
  - Uses Vite-style `VITE_` env vars. See `src/utils/firebase.js` for required keys:
    - `VITE_FIREBASE_API_KEY`
    - `VITE_FIREBASE_AUTH_DOMAIN`
    - `VITE_FIREBASE_PROJECT_ID`
    - `VITE_FIREBASE_STORAGE_BUCKET`
    - `VITE_FIREBASE_MESSAGING_SENDER_ID`
    - `VITE_FIREBASE_APP_ID`
    - `VITE_FIREBASE_MEASUREMENT_ID`
    - `VITE_USE_FIREBASE_EMULATOR` (optional, for local dev)
- **Backend (Cloud Functions):**
  - Create a `.env` file in `functions/` with the following keys (see code for full list):
    - `GEMINI_API_KEY`
    - `MISTRAL_API_KEY`
    - `DEEPINFRA_API_KEY`
    - `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SENDER_EMAIL`
    - `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` (optional, for observability)
    - `ZEROENTROPY_API_KEY` (if using ZeroEntropy features)

### 4. Local Development

- **Frontend:**
  ```bash
  npm run dev
  ```
- **Backend (Functions Emulator):**
  ```bash
  cd functions
  npm run serve
  ```
- **All Firebase Emulators:**
  ```bash
  firebase emulators:start
  ```

### 5. Build & Deploy

- **Build Frontend:**
  ```bash
  npm run build
  ```
- **Deploy to Firebase:**
  ```bash
  firebase deploy
  ```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

- Please follow the existing code style (see ESLint/Prettier configs).
- Add tests or documentation for new features when possible.
- Respect user privacy and security in all contributions.

---

## 📄 License

[Apache License 2.0](LICENSE) — See LICENSE file for details.

---

## 🙏 Acknowledgments

- Inspired by students and educators worldwide.
- Built with [Firebase](https://firebase.google.com/), [OpenAI](https://openai.com/), [Google Gemini](https://ai.google.dev/), [Mistral](https://mistral.ai/), and the open-source community.

---

> _Chiara is open-source and always improving. Contributions, feedback, and ideas are welcome!_
