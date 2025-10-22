import { NextRequest, NextResponse } from "next/server";
import AWS from "aws-sdk";

// S3設定
const s3 = new AWS.S3({
  region: process.env.AWS_REGION!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (!date) return NextResponse.json([], { status: 400 });

    // バケット名
    const Bucket = process.env.S3_BUCKET_NAME!;
    
    // S3内の指定日付の画像を取得
    const list = await s3
      .listObjectsV2({ Bucket, Prefix: `${date}_` })
      .promise();

      const images = list.Contents?.map((obj, idx) => ({
        id: idx,
        url: obj.Key
          ? s3.getSignedUrl("getObject", {
              Bucket,
              Key: obj.Key,
              Expires: 60 * 60, // 1時間有効
            })
          : "",
      })) || [];
      

    return NextResponse.json(images);
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
