<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1gdkL8sqByMgC3dgVhVL9pU3IZ-JyicpC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_BIGMODEL_API_KEY` to your key
   - (optional) `VITE_BIGMODEL_BASE_URL` if you use a custom endpoint, default: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
   - (optional) `VITE_OPENAI_MODEL` if you want a different model, default: `glm-4-flash`
3. Run the app:
   `npm run dev`
