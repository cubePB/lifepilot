# LifePilot

A local-first note analysis app. You paste messy notes, and LifePilot turns them into a clear review with summary, themes, next steps, risks, questions, and organized details.

## What works now

- One simple note input
- Real AI API review through `app.js`
- Clean summary
- Useful takeaway
- Suggested next steps
- Watch-outs and clarifying questions
- Organized buckets for actions, dates, money, and people
- Saved review history in the browser

## API setup

For Vercel, do not put API keys in `app.js`.

Add this environment variable in Vercel:

- `GROQ_API_KEY`

Optional:

- `GROQ_MODEL`, defaulting to `llama-3.3-70b-versatile`

The browser calls `/api/analyze`, and Vercel's serverless function calls Groq privately.

## Useful AI upgrades to build next

1. Connect a real AI model for deeper reasoning.
2. Let the user approve or edit the AI review before saving.
3. Add project folders for related notes.
4. Add natural language search across saved reviews.
5. Add import/export backup.

See `AI_COLLABORATION.md` for a simple Codex + Claude workflow.

## How to try it

Open `index.html` in a browser.
