import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegPath.path);

export async function POST(req: Request) {
  const { audioSegments } = await req.json();

  const tempDir = "/tmp";
  const files: string[] = [];

  // Save incoming base64 to temp files
  for (const segment of audioSegments) {
    const filePath = path.join(tempDir, segment.fileName);
    fs.writeFileSync(filePath, Buffer.from(segment.dataBase64, "base64"));
    files.push(filePath);
  }

  // Merge files
  const outputPath = path.join(tempDir, "merged.mp3");

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    files.forEach(f => command.input(f));
    command
      .on("end", () => {
        const mergedData = fs.readFileSync(outputPath);
        resolve(
          new Response(
            JSON.stringify({ mergedBase64: mergedData.toString("base64") }),
            { headers: { "Content-Type": "application/json" } }
          )
        );
      })
      .on("error", err => reject(err))
      .mergeToFile(outputPath);
  });
}