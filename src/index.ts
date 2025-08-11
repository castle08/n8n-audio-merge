import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Shared ffmpeg instance
let ffmpeg: FFmpeg | null = null;
let ffmpegReady = false;

async function getFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }
  if (!ffmpegReady) {
    // Load ffmpeg.wasm core directly from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    ffmpegReady = true;
  }
  return ffmpeg!;
}

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

async function writeConcatList(ff: FFmpeg, files: string[]) {
  const lines = files.map((f) => `file '${f}'`).join('\n');
  await ff.writeFile('list.txt', new TextEncoder().encode(lines));
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
      const ff = await getFFmpeg();

      // Clean up from previous runs
      try { await ff.deleteFile('list.txt'); } catch {}
      try { await ff.deleteFile('output.mp3'); } catch {}

      // Sort by timing if provided
      audioSegments.sort((a: any, b: any) => (a.startMs ?? 0) - (b.startMs ?? 0));

      // Write all clips to ffmpeg FS as MP3s
      const fileNames: string[] = [];
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

        let ext = 'mp3';
        if (seg.dataUri) ext = getExtensionFromDataUri(seg.dataUri);
        else if (seg.fileName) ext = seg.fileName.split('.').pop()?.toLowerCase() || 'mp3';

        const fileName = `seg_${i}.${ext}`;
        const buf = new Uint8Array(Buffer.from(b64, 'base64'));
        await ff.writeFile(fileName, buf);
        fileNames.push(fileName);
      }

      // Concat with demuxer (no re-encode)
      await writeConcatList(ff, fileNames);
      await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp3']);

      const out = await ff.readFile('output.mp3');
      const base64 = Buffer.from(out as Uint8Array).toString('base64');

      return new Response(JSON.stringify({
        ok: true,
        mergedBase64: base64,
        contentType: 'audio/mpeg',
        fileName: 'podcast_final.mp3',
        segmentCount: audioSegments.length
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
