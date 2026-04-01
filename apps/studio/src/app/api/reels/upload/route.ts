import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Vercel serverless: only /tmp is writable. Use /tmp for local fallback.
const UPLOAD_DIR = process.env.VERCEL
  ? path.join("/tmp", "reels-uploads")
  : path.resolve(process.cwd(), "../../outputs/reels/uploads");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No video file" }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "50MB 초과" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".mp4";

    // Use R2 if configured (recommended for production)
    if (process.env.R2_ENDPOINT) {
      const { uploadFile } = await import("@/lib/storage");
      const key = `reels/${Date.now()}-${crypto.randomUUID()}${ext}`;
      const url = await uploadFile(key, buffer, file.type || "video/mp4");
      return NextResponse.json({ url, filename: key });
    }

    // Local/tmp fallback (files are ephemeral on Vercel)
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const id = crypto.randomBytes(8).toString("hex");
    const filename = `${id}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);

    const url = `/api/reels/file?name=${encodeURIComponent(filename)}`;
    return NextResponse.json({
      url,
      filename,
      ...(process.env.VERCEL && { warning: "File stored in /tmp — ephemeral on Vercel. Configure R2_ENDPOINT for persistent storage." }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
