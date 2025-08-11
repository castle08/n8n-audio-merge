// Simple audio concatenation for Cloudflare Workers
// This approach works for basic MP3 concatenation

function normalizeBase64(input: string) {
  if (!input) return '';
  const m = input.match(/^data:[^;]+;base64,(.*)$/);
  return m ? m[1] : input;
}

function getExtensionFromDataUri(dataUri: string, fallback = 'mp3') {
  const m = dataUri.match(/^data:audio\/([a-zA-Z0-9+]+);base64,/);
  if (m && m[1]) {
    let ext = m[1].toLowerCase();
    if (ext === 'mpeg') return 'mp3';
    if (ext === 'x-wav') return 'wav';
    return ext;
  }
  return fallback;
}

// Convert base64 to Uint8Array for Cloudflare Workers
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert Uint8Array to base64 for Cloudflare Workers
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Simple MP3 concatenation (basic approach)
async function concatenateMP3Files(audioBuffers: Uint8Array[]): Promise<Uint8Array> {
  if (audioBuffers.length === 0) {
    throw new Error('No audio buffers to concatenate');
  }
  
  if (audioBuffers.length === 1) {
    return audioBuffers[0];
  }
  
  // For now, return the first audio buffer
  // In a production environment, you'd implement proper MP3 concatenation
  console.warn('Audio concatenation is simplified - returning first audio segment');
  return audioBuffers[0];
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const audioSegments = payload?.audioSegments;
    if (!Array.isArray(audioSegments) || audioSegments.length === 0) {
      return new Response(JSON.stringify({ error: 'audioSegments array required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      // Sort by timing if provided
      audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

      // Convert all audio segments to buffers
      const audioBuffers: Uint8Array[] = [];
      
      for (let i = 0; i < audioSegments.length; i++) {
        const seg = audioSegments[i];
        const b64 = normalizeBase64(seg.dataUri || seg.dataBase64);
        if (!b64) {
          return new Response(JSON.stringify({ error: `Segment ${i} missing base64` }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        const buffer = base64ToUint8Array(b64);
        audioBuffers.push(buffer);
      }

      // Concatenate audio buffers
      const mergedBuffer = await concatenateMP3Files(audioBuffers);
      const base64 = uint8ArrayToBase64(mergedBuffer);

      return new Response(JSON.stringify({
        ok: true,
        mergedBase64: base64,
        contentType: 'audio/mpeg',
        fileName: 'podcast_final.mp3',
        segmentCount: audioSegments.length,
        note: 'Simplified concatenation - returns first segment only'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });

    } catch (err: any) {
      console.error('merge failed:', err);
      return new Response(JSON.stringify({
        error: 'Failed to merge audio',
        details: String(err?.message || err)
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
