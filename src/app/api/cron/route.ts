import { NextResponse } from "next/server";
import { google } from "googleapis";
import AWS from "aws-sdk";

export async function GET() {
  const accessToken = process.env.THREADS_ACCESS_TOKEN!;
  const userId = process.env.THREADS_USER_ID!;
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const s3Bucket = process.env.S3_BUCKET_NAME!;
  const s3Region = process.env.AWS_REGION!;

  // JSON文字列をパースしてサービスアカウントキーに変換
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

  try {
    // Google Sheets API クライアント
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // 今日の日付
    const today = new Date().toISOString().slice(0, 10);

    // シートから全データ取得
    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A2:B",
    });

    const rows = sheetData.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: "シートにデータがありません" });
    }

    // 今日の日付の行を検索
    const todayRow = rows.find((row) => row[0] === today);
    if (!todayRow || !todayRow[1]) {
      return NextResponse.json({ success: false, error: "今日の日付のテキストが見つかりません" });
    }
    const message = todayRow[1];

    // AWS S3 クライアント
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: s3Region,
    });

    // 署名付き URL 取得
    let imageUrl: string | null = null;
    try {
      imageUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: s3Bucket,
        Key: `${today}.jpg`,
        Expires: 60 * 60,
      });
    } catch (err) {
      console.warn("S3画像が見つかりません:", err);
    }

    // Threads API コンテナ作成
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
    const data = JSON.parse(rawText);

    if (!data.id) {
      return NextResponse.json({ success: false, error: "コンテナIDが取得できません", data });
    }

    // Threads API 公開
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
