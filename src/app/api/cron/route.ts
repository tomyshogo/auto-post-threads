import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  const accessToken = process.env.THREADS_ACCESS_TOKEN!;
  const userId = process.env.THREADS_USER_ID!;
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

  try {
    // Google Sheets API クライアント
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // スプレッドシートから取得
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A2:B2",
    });

    const row = sheetData.data.values?.[0];
    if (!row || !row[0]) {
      return NextResponse.json({ success: false, error: "データがありません" });
    }

    const [message, imageUrl] = row;

    // Threads API: コンテナ作成
    const res = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        media_type: imageUrl ? "IMAGE" : "TEXT",
        text: message,
        ...(imageUrl && { image_url: imageUrl }),
      }),
    });

    const rawText = await res.text();
    console.log("Raw Threads API response:", rawText);
    const data = JSON.parse(rawText);

    if (!data.id) {
      return NextResponse.json({ success: false, error: "コンテナIDが取得できません", data });
    }

    // Threads API: 公開
    const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ creation_id: data.id }),
    });

    const publishData = await publishRes.json();
    return NextResponse.json({ success: true, container: data, published: publishData });
  } catch (error) {
    console.error("Error posting to Threads:", error);
    return NextResponse.json({ success: false, error: (error as Error).message });
  }
}
