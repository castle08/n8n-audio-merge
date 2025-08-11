# N8N Audio Merge API

A Cloudflare Workers API for merging audio segments using ffmpeg.wasm.

## Features

- ✅ **Proper audio concatenation** using ffmpeg.wasm
- ✅ **Cloudflare Workers** - runs in edge environment
- ✅ **WebAssembly support** - ffmpeg.wasm works perfectly
- ✅ **CORS enabled** - works with n8n and other clients

## API Endpoints

- `POST /` - Merge audio segments

## Request Format

```json
{
  "audioSegments": [
    {
      "dataUri": "data:audio/mp3;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT..."
    }
  ]
}
```

## Response Format

```json
{
  "ok": true,
  "mergedBase64": "UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT...",
  "contentType": "audio/mpeg",
  "fileName": "podcast_final.mp3",
  "segmentCount": 1
}
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

## Deployment

This project is deployed on Cloudflare Workers with proper ffmpeg.wasm support for audio processing.
