"use client";

import { useState, useEffect } from "react";

// Threads API レスポンス型
interface ThreadsResponse {
  success?: boolean;
  container?: { id?: string; [key: string]: unknown };
  published?: { [key: string]: unknown };
  error?: string;
}

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState<string>(""); // 初期は空文字
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const [posting, setPosting] = useState(false);
  const [threadResult, setThreadResult] = useState<ThreadsResponse | null>(null);

  // クライアント側でのみ日付を設定
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setUploadDate(today);
  }, []);

  // S3にアップロードする関数
  const handleUpload = async () => {
    if (!selectedFile) {
      alert("ファイルを選択してください");
      return;
    }

    setUploading(true);
    setUploadedUrl(null);

    try {
      // 1. S3署名付きURLを取得
      const res = await fetch(`/api/get-s3-url?filename=${uploadDate}.jpg`);
      if (!res.ok) throw new Error("署名付きURLの取得に失敗しました");

      const { url, key } = await res.json();

      // 2. S3にPUTリクエスト
      const putRes = await fetch(url, {
        method: "PUT",
        body: selectedFile,
      });
      if (!putRes.ok) throw new Error("S3へのアップロードに失敗しました");

      // 3. 完了URLをセット
      const fileUrl = `https://threadsforautopost.s3.ap-northeast-1.amazonaws.com/${key}`;
      setUploadedUrl(fileUrl);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // Threadsに投稿する関数
  const handlePostToThreads = async () => {
    setPosting(true);
    setThreadResult(null);

    try {
      const res = await fetch(`/api/cron`);
      const data: ThreadsResponse = await res.json();
      setThreadResult(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="font-sans p-8">
      <h1 className="text-2xl font-bold mb-4">S3画像アップロード</h1>

      {/* 日付入力 */}
      <div className="mb-4">
        <label className="mr-2">日付:</label>
        <input
          type="date"
          value={uploadDate}
          onChange={(e) => setUploadDate(e.target.value)}
          className="border px-2 py-1 rounded"
        />
      </div>

      {/* 画像選択 */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !uploadDate}
          className="ml-2 px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          {uploading ? "アップロード中..." : "アップロード"}
        </button>
      </div>

      {/* アップロード結果 */}
      {uploadedUrl && (
        <div className="mt-4 p-2 border rounded bg-gray-100 dark:bg-gray-800">
          <p>アップロード完了:</p>
          <a
            href={uploadedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline break-all"
          >
            {uploadedUrl}
          </a>
        </div>
      )}

      <p className="mt-4 text-gray-500 text-sm">
        ※ 投稿はcronで自動的に行われます。
      </p>

      <button
        onClick={handlePostToThreads}
        className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {posting ? "投稿中..." : "Threadsに本日分を投稿"}
      </button>

      {/* Threads API レスポンス表示 */}
      {threadResult && (
        <div className="mt-4 p-2 border rounded bg-gray-100 dark:bg-gray-800">
          <h2 className="font-semibold mb-2">投稿結果:</h2>
          <pre className="text-sm">{JSON.stringify(threadResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
