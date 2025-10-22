// app/api/get-s3-url/route.ts
import { NextResponse } from "next/server";
import AWS from "aws-sdk";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "ファイル名が指定されていません" }, { status: 400 });
  }

  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    signatureVersion: "v4",
  });

  const params = {
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: filename,
    Expires: 60, // 署名URLの有効期限（60秒）
    ContentType: "image/jpeg",
  };

  try {
    const url = await s3.getSignedUrlPromise("putObject", params);
    return NextResponse.json({ url, key: filename });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json({ error: "署名付きURLの生成に失敗しました" }, { status: 500 });
  }
}
