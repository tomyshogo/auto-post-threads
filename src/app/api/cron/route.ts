import { NextResponse } from "next/server";
import { google } from "googleapis";
import AWS from "aws-sdk";

export async function GET() {
  const accessToken = process.env.THREADS_ACCESS_TOKEN!;
  const userId = process.env.THREADS_USER_ID!;
  const sheetId = process.env.GOOGLE_SHEET_ID!;
  const s3Bucket = process.env.S3_BUCKET_NAME!;
  const s3Region = process.env.AWS_REGION!;
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);

  try {
    // --- Google Sheets 読み取り ---
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const now = new Date();
    const jstOffset = 9 * 60; // JST (+9時間)
    const jstDate = new Date(now.getTime() + jstOffset * 60 * 1000);
    const today = jstDate.toISOString().slice(0, 10); // 例: 2025-10-23

    const sheetData = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A2:B",
    });

    const rows = sheetData.data.values;
    if (!rows || rows.length === 0)
      return NextResponse.json({ success: false, error: "シートにデータがありません" });

    const todayRow = rows.find((row) => row[0] === today);
    if (!todayRow || !todayRow[1])
      return NextResponse.json({ success: false, error: "今日の日付のテキストが見つかりません" });

    const message = todayRow[1];

    // --- S3の画像取得 ---
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: s3Region,
    });

    const listRes = await s3.listObjectsV2({
      Bucket: s3Bucket,
      Prefix: `${today}_`, // 例: 2025-10-23_abc.jpg
    }).promise();

    const imageKeys = listRes.Contents?.map((item) => item.Key!).filter(Boolean) || [];
    if (imageKeys.length === 0)
      return NextResponse.json({ success: false, error: "S3に画像がありません" });

    // 署名付きURL生成
    const imageUrls = await Promise.all(
      imageKeys.map((key) =>
        s3.getSignedUrlPromise("getObject", {
          Bucket: s3Bucket,
          Key: key,
          Expires: 60 * 60,
        })
      )
    );

    let creationId = "";

    // --- Threads 投稿 ---
    if (imageUrls.length === 1) {
      // 単一画像投稿
      const containerRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "IMAGE",
          image_url: imageUrls[0],
          text: message,
        }),
      });
      const containerData = await containerRes.json();

      if (!containerData.id)
        return NextResponse.json({ success: false, error: "画像コンテナ作成失敗", data: containerData });

      creationId = containerData.id;
    } else {
      // カルーセル投稿
      const childIds: string[] = [];

      for (const url of imageUrls) {
        const childRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            media_type: "IMAGE",
            image_url: url,
            is_carousel_item: true,
          }),
        });
        const childData = await childRes.json();

        if (!childData.id)
          return NextResponse.json({ success: false, error: "カルーセル画像作成失敗", data: childData });

        childIds.push(childData.id);
      }

      // カルーセルコンテナ作成
      const carouselRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: childIds,
          text: message,
        }),
      });
      const carouselData = await carouselRes.json();

      if (!carouselData.id)
        return NextResponse.json({ success: false, error: "カルーセル作成失敗", data: carouselData });

      creationId = carouselData.id;
    }

    // --- 公開 ---
    const publishRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ creation_id: creationId }),
    });
    const publishData = await publishRes.json();

    return NextResponse.json({ success: true, published: publishData });

  } catch (error) {
    console.error("Error posting to Threads:", error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    });
  }
}
