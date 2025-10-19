// app/api/post/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const THREADS_USER_ID = process.env.THREADS_USER_ID!;
  const ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN!;

  const res = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Next.js + Threads API からの自動投稿テスト 🎉",
      }),
    }
  );

  const data = await res.json();
  return NextResponse.json(data);
}
